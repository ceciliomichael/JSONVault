package store

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

const (
	indexesMetaBucketPrefix = "_indexes_meta"
	indexBucketPrefix       = "_idx"
)

func encodeIndexValue(val interface{}) string {
	switch v := val.(type) {
	case string:
		return "s:" + v
	case bool:
		if v {
			return "b:true"
		}
		return "b:false"
	case float64:
		return "n:" + strconv.FormatFloat(v, 'f', -1, 64)
	case nil:
		return "z:null"
	default:
		return "u:" + fmt.Sprintf("%v", v)
	}
}

func parseFilterValue(s string) interface{} {
	if s == "true" {
		return true
	}
	if s == "false" {
		return false
	}
	if s == "null" {
		return nil
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

// getIndexesMetaBucketName returns the metadata bucket name
func getIndexesMetaBucketName() []byte {
	return []byte(indexesMetaBucketPrefix)
}

// getIndexBucketName returns the bucket name for a specific index
func getIndexBucketName(collection, field string) []byte {
	return []byte(fmt.Sprintf("%s_%s_%s", indexBucketPrefix, collection, field))
}

// ListIndexes returns a list of indexed fields for a given collection.
func (s *Store) ListIndexes(database, collection string) ([]string, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, err
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	var indexes []string
	err = db.View(func(tx *bolt.Tx) error {
		metaBucket := tx.Bucket(getIndexesMetaBucketName())
		if metaBucket == nil {
			return nil // No indexes
		}

		data := metaBucket.Get([]byte(collection))
		if data == nil {
			return nil
		}

		if err := sonic.Unmarshal(data, &indexes); err != nil {
			return fmt.Errorf("corrupt index metadata: %w", err)
		}
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("list indexes: %w", err)
	}

	if indexes == nil {
		indexes = []string{}
	}
	return indexes, nil
}

// CreateIndex creates an index on a specific field for a collection and backfills it.
func (s *Store) CreateIndex(database, collection, field string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}
	if field == "" {
		return errors.New("field cannot be empty")
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	return db.Update(func(tx *bolt.Tx) error {
		// Ensure collection exists
		colBucket := tx.Bucket([]byte(collection))
		if colBucket == nil {
			return ErrNotFound
		}

		// 1. Update metadata
		metaBucket, err := tx.CreateBucketIfNotExists(getIndexesMetaBucketName())
		if err != nil {
			return err
		}

		var indexes []string
		existingData := metaBucket.Get([]byte(collection))
		if existingData != nil {
			if err := sonic.Unmarshal(existingData, &indexes); err != nil {
				return fmt.Errorf("corrupt index metadata: %w", err)
			}
			// Check if already exists
			for _, idx := range indexes {
				if idx == field {
					return nil // Already indexed
				}
			}
		}

		indexes = append(indexes, field)
		newData, err := sonic.Marshal(indexes)
		if err != nil {
			return err
		}
		if err := metaBucket.Put([]byte(collection), newData); err != nil {
			return err
		}

		// 2. Create the Index Bucket
		idxBucketName := getIndexBucketName(collection, field)
		idxBucket, err := tx.CreateBucketIfNotExists(idxBucketName)
		if err != nil {
			return err
		}

		// 3. Backfill index with existing documents
		c := colBucket.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			// Decrypt if necessary
			plaintext, err := decryptDocument(v, s.encryptionKey)
			if err != nil {
				continue // Skip corrupt documents during backfill
			}

			var parsed map[string]interface{}
			if err := sonic.Unmarshal(plaintext, &parsed); err != nil {
				continue
			}

			val, exists := parsed[field]
			if !exists {
				continue
			}

			strVal := encodeIndexValue(val)
			
			// Get or create nested bucket for this specific value
			valBucket, err := idxBucket.CreateBucketIfNotExists([]byte(strVal))
			if err != nil {
				return err
			}
			
			// Store Document ID -> nil in the nested bucket
			if err := valBucket.Put(k, nil); err != nil {
				return err
			}
		}

		return nil
	})
}

// DeleteIndex removes an index and cleans up its buckets.
func (s *Store) DeleteIndex(database, collection, field string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	return db.Update(func(tx *bolt.Tx) error {
		metaBucket := tx.Bucket(getIndexesMetaBucketName())
		if metaBucket == nil {
			return ErrNotFound
		}

		existingData := metaBucket.Get([]byte(collection))
		if existingData == nil {
			return ErrNotFound
		}

		var indexes []string
		if err := sonic.Unmarshal(existingData, &indexes); err != nil {
			return fmt.Errorf("corrupt index metadata: %w", err)
		}

		found := false
		var newIndexes []string
		for _, idx := range indexes {
			if idx == field {
				found = true
			} else {
				newIndexes = append(newIndexes, idx)
			}
		}

		if !found {
			return ErrNotFound
		}

		newData, err := sonic.Marshal(newIndexes)
		if err != nil {
			return err
		}
		if err := metaBucket.Put([]byte(collection), newData); err != nil {
			return err
		}

		// Delete the entire index bucket
		idxBucketName := getIndexBucketName(collection, field)
		if tx.Bucket(idxBucketName) != nil {
			if err := tx.DeleteBucket(idxBucketName); err != nil {
				return err
			}
		}

		return nil
	})
}

// Helper methods for indexing inside transactions

// getIndexedFieldsTx gets the list of indexed fields for a collection in a transaction
func getIndexedFieldsTx(tx *bolt.Tx, collection string) []string {
	metaBucket := tx.Bucket(getIndexesMetaBucketName())
	if metaBucket == nil {
		return nil
	}
	data := metaBucket.Get([]byte(collection))
	if data == nil {
		return nil
	}
	var indexes []string
	sonic.Unmarshal(data, &indexes) // Ignore errors
	return indexes
}

// indexDocumentTx adds a document to all relevant indexes
func indexDocumentTx(tx *bolt.Tx, collection, docID string, doc []byte) error {
	indexes := getIndexedFieldsTx(tx, collection)
	if len(indexes) == 0 {
		return nil
	}

	var parsed map[string]interface{}
	if err := sonic.Unmarshal(doc, &parsed); err != nil {
		return err
	}

	for _, field := range indexes {
		val, exists := parsed[field]
		if !exists {
			continue
		}
		strVal := encodeIndexValue(val)

		idxBucketName := getIndexBucketName(collection, field)
		idxBucket := tx.Bucket(idxBucketName)
		if idxBucket == nil {
			continue // Should exist if metadata exists, but play it safe
		}

		valBucket, err := idxBucket.CreateBucketIfNotExists([]byte(strVal))
		if err != nil {
			return err
		}
		if err := valBucket.Put([]byte(docID), nil); err != nil {
			return err
		}
	}
	return nil
}

// unindexDocumentTx removes a document from all relevant indexes based on its OLD payload
func unindexDocumentTx(tx *bolt.Tx, collection, docID string, oldDoc []byte) error {
	indexes := getIndexedFieldsTx(tx, collection)
	if len(indexes) == 0 {
		return nil
	}

	var parsed map[string]interface{}
	if err := sonic.Unmarshal(oldDoc, &parsed); err != nil {
		return err // Or return nil to tolerate corrupt deletes
	}

	for _, field := range indexes {
		val, exists := parsed[field]
		if !exists {
			continue
		}
		strVal := encodeIndexValue(val)

		idxBucketName := getIndexBucketName(collection, field)
		idxBucket := tx.Bucket(idxBucketName)
		if idxBucket == nil {
			continue
		}

		valBucket := idxBucket.Bucket([]byte(strVal))
		if valBucket == nil {
			continue
		}

		if err := valBucket.Delete([]byte(docID)); err != nil {
			return err
		}
	}
	return nil
}
