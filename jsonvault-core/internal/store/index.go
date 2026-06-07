package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

const (
	indexesMetaBucketPrefix = "_indexes_meta"
	indexesBuildBucketName  = "_indexes_build"
	indexBucketPrefix       = "_idx"
)

const indexBuildBatchSize = 500

type indexBackfillEntry struct {
	docID string
	etag  string
	value string
}

var errIndexAlreadyExists = errors.New("index already exists")

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

// getIndexesMetaBucketName returns the metadata bucket name
func getIndexesMetaBucketName() []byte {
	return []byte(indexesMetaBucketPrefix)
}

func getIndexesBuildBucketName() []byte {
	return []byte(indexesBuildBucketName)
}

// getIndexBucketName returns the bucket name for a specific index
func getIndexBucketName(collection, field string) []byte {
	return []byte(fmt.Sprintf("%s_%s_%s", indexBucketPrefix, collection, field))
}

func getIndexBuildKey(collection, field string) []byte {
	return []byte(collection + "\x00" + field)
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
func (s *Store) CreateIndex(ctx context.Context, database, collection, field string) error {
	ctx = contextOrBackground(ctx)
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}
	if err := ValidateFieldName(field); err != nil {
		return err
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	if err := s.startIndexBuild(ctx, db, collection, field); err != nil {
		if errors.Is(err, errIndexAlreadyExists) {
			return nil
		}
		return err
	}

	cleanup := true
	defer func() {
		if cleanup {
			_ = s.abortIndexBuild(db, collection, field)
		}
	}()

	var after []byte
	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		batch, lastKey, done, err := s.collectIndexBackfillBatch(ctx, db, collection, field, after, indexBuildBatchSize)
		if err != nil {
			return err
		}
		if len(batch) > 0 {
			if err := s.applyIndexBackfillBatch(ctx, db, collection, field, batch); err != nil {
				return err
			}
		}
		if done {
			break
		}
		after = lastKey
	}

	if err := s.finishIndexBuild(ctx, db, collection, field); err != nil {
		return err
	}
	cleanup = false
	return nil
}

func (s *Store) startIndexBuild(ctx context.Context, db *DBHandle, collection, field string) error {
	return db.Update(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if tx.Bucket([]byte(collection)) == nil {
			return ErrNotFound
		}

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
			for _, idx := range indexes {
				if idx == field {
					return errIndexAlreadyExists
				}
			}
		}

		buildBucket, err := tx.CreateBucketIfNotExists(getIndexesBuildBucketName())
		if err != nil {
			return err
		}
		buildKey := getIndexBuildKey(collection, field)
		if buildBucket.Get(buildKey) != nil {
			return fmt.Errorf("index build already in progress")
		}

		idxBucketName := getIndexBucketName(collection, field)
		if tx.Bucket(idxBucketName) != nil {
			if err := tx.DeleteBucket(idxBucketName); err != nil {
				return err
			}
		}
		if _, err := tx.CreateBucket(idxBucketName); err != nil {
			return err
		}
		return buildBucket.Put(buildKey, []byte{1})
	})
}

func (s *Store) collectIndexBackfillBatch(ctx context.Context, db *DBHandle, collection, field string, after []byte, limit int) ([]indexBackfillEntry, []byte, bool, error) {
	var batch []indexBackfillEntry
	var lastKey []byte
	var done bool

	err := db.View(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		colBucket := tx.Bucket([]byte(collection))
		if colBucket == nil {
			return ErrNotFound
		}

		c := colBucket.Cursor()
		var k, v []byte
		if len(after) == 0 {
			k, v = c.First()
		} else {
			k, v = c.Seek(after)
			if bytes.Equal(k, after) {
				k, v = c.Next()
			}
		}

		scanned := 0
		for ; k != nil && scanned < limit; k, v = c.Next() {
			if err := ctx.Err(); err != nil {
				return err
			}
			scanned++
			lastKey = append(lastKey[:0], k...)

			plaintext, err := decryptDocument(v, s.encryptionKey, s.encryptionRequired)
			if err != nil {
				return fmt.Errorf("corrupt document (decrypt): %w", err)
			}

			var parsed map[string]interface{}
			if err := sonic.Unmarshal(plaintext, &parsed); err != nil {
				continue
			}

			val, exists := parsed[field]
			if !exists {
				continue
			}

			batch = append(batch, indexBackfillEntry{
				docID: string(k),
				etag:  computeETag(plaintext),
				value: encodeIndexValue(val),
			})
		}
		done = k == nil
		return nil
	})

	return batch, lastKey, done, err
}

func (s *Store) applyIndexBackfillBatch(ctx context.Context, db *DBHandle, collection, field string, batch []indexBackfillEntry) error {
	return db.Update(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !isIndexBuildingTx(tx, collection, field) {
			return fmt.Errorf("index build is no longer active")
		}

		colBucket := tx.Bucket([]byte(collection))
		if colBucket == nil {
			return ErrNotFound
		}

		idxBucket := tx.Bucket(getIndexBucketName(collection, field))
		if idxBucket == nil {
			return fmt.Errorf("index build bucket missing")
		}

		for _, entry := range batch {
			existingData := colBucket.Get([]byte(entry.docID))
			if existingData == nil {
				continue
			}
			plaintext, err := decryptDocument(existingData, s.encryptionKey, s.encryptionRequired)
			if err != nil {
				return fmt.Errorf("corrupt document (decrypt): %w", err)
			}
			if computeETag(plaintext) != entry.etag {
				continue
			}

			valBucket, err := idxBucket.CreateBucketIfNotExists([]byte(entry.value))
			if err != nil {
				return err
			}
			if err := valBucket.Put([]byte(entry.docID), nil); err != nil {
				return err
			}
		}

		return nil
	})
}

func (s *Store) finishIndexBuild(ctx context.Context, db *DBHandle, collection, field string) error {
	return db.Update(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if tx.Bucket([]byte(collection)) == nil {
			return ErrNotFound
		}
		if !isIndexBuildingTx(tx, collection, field) {
			return fmt.Errorf("index build is no longer active")
		}

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
			for _, idx := range indexes {
				if idx == field {
					return clearIndexBuildingTx(tx, collection, field)
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
		return clearIndexBuildingTx(tx, collection, field)
	})
}

func (s *Store) abortIndexBuild(db *DBHandle, collection, field string) error {
	return db.Update(func(tx *bolt.Tx) error {
		return deleteIndexBucketAndBuildTx(tx, collection, field)
	})
}

func isIndexBuildingTx(tx *bolt.Tx, collection, field string) bool {
	buildBucket := tx.Bucket(getIndexesBuildBucketName())
	if buildBucket == nil {
		return false
	}
	return buildBucket.Get(getIndexBuildKey(collection, field)) != nil
}

func clearIndexBuildingTx(tx *bolt.Tx, collection, field string) error {
	buildBucket := tx.Bucket(getIndexesBuildBucketName())
	if buildBucket == nil {
		return nil
	}
	return buildBucket.Delete(getIndexBuildKey(collection, field))
}

func deleteIndexBuildMetadataForCollectionTx(tx *bolt.Tx, collection string) error {
	buildBucket := tx.Bucket(getIndexesBuildBucketName())
	if buildBucket == nil {
		return nil
	}

	prefix := []byte(collection + "\x00")
	c := buildBucket.Cursor()
	for k, _ := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, _ = c.Next() {
		if err := c.Delete(); err != nil {
			return err
		}
	}
	return nil
}

// DeleteIndex removes an index and cleans up its buckets.
func (s *Store) DeleteIndex(database, collection, field string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}
	if err := ValidateFieldName(field); err != nil {
		return err
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	return db.Update(func(tx *bolt.Tx) error {
		metaBucket := tx.Bucket(getIndexesMetaBucketName())
		if metaBucket == nil {
			if isIndexBuildingTx(tx, collection, field) {
				return deleteIndexBucketAndBuildTx(tx, collection, field)
			}
			return ErrNotFound
		}

		existingData := metaBucket.Get([]byte(collection))
		if existingData == nil {
			if isIndexBuildingTx(tx, collection, field) {
				return deleteIndexBucketAndBuildTx(tx, collection, field)
			}
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
			if isIndexBuildingTx(tx, collection, field) {
				return deleteIndexBucketAndBuildTx(tx, collection, field)
			}
			return ErrNotFound
		}

		newData, err := sonic.Marshal(newIndexes)
		if err != nil {
			return err
		}
		if err := metaBucket.Put([]byte(collection), newData); err != nil {
			return err
		}

		return deleteIndexBucketAndBuildTx(tx, collection, field)
	})
}

func deleteIndexBucketAndBuildTx(tx *bolt.Tx, collection, field string) error {
	idxBucketName := getIndexBucketName(collection, field)
	if tx.Bucket(idxBucketName) != nil {
		if err := tx.DeleteBucket(idxBucketName); err != nil {
			return err
		}
	}
	return clearIndexBuildingTx(tx, collection, field)
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

func getBuildingIndexFieldsTx(tx *bolt.Tx, collection string) []string {
	buildBucket := tx.Bucket(getIndexesBuildBucketName())
	if buildBucket == nil {
		return nil
	}

	prefix := []byte(collection + "\x00")
	var fields []string
	c := buildBucket.Cursor()
	for k, _ := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, _ = c.Next() {
		fields = append(fields, string(k[len(prefix):]))
	}
	return fields
}

func getWritableIndexFieldsTx(tx *bolt.Tx, collection string) []string {
	indexes := getIndexedFieldsTx(tx, collection)
	building := getBuildingIndexFieldsTx(tx, collection)
	if len(building) == 0 {
		return indexes
	}

	seen := make(map[string]struct{}, len(indexes)+len(building))
	merged := make([]string, 0, len(indexes)+len(building))
	for _, field := range indexes {
		if _, ok := seen[field]; ok {
			continue
		}
		seen[field] = struct{}{}
		merged = append(merged, field)
	}
	for _, field := range building {
		if _, ok := seen[field]; ok {
			continue
		}
		seen[field] = struct{}{}
		merged = append(merged, field)
	}
	return merged
}

// indexDocumentTx adds a document to all relevant indexes (B-Tree and FTS)
func indexDocumentTx(tx *bolt.Tx, collection, docID string, doc []byte) error {
	var parsed map[string]interface{}
	if err := sonic.Unmarshal(doc, &parsed); err != nil {
		return err
	}

	// 1. Hook into Full-Text Search
	if err := indexFTS(tx, collection, docID, parsed); err != nil {
		return fmt.Errorf("fts index: %w", err)
	}

	// 2. Hook into B-Tree Secondary Indexes
	indexes := getWritableIndexFieldsTx(tx, collection)
	if len(indexes) == 0 {
		return nil
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
	var parsed map[string]interface{}
	if err := sonic.Unmarshal(oldDoc, &parsed); err != nil {
		return err // Or return nil to tolerate corrupt deletes
	}

	// 1. Hook into Full-Text Search
	if err := unindexFTS(tx, collection, docID); err != nil {
		return fmt.Errorf("fts unindex: %w", err)
	}

	// 2. Hook into B-Tree Secondary Indexes
	indexes := getWritableIndexFieldsTx(tx, collection)
	if len(indexes) == 0 {
		return nil
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
		c := valBucket.Cursor()
		k, _ := c.First()
		if k == nil {
			if err := idxBucket.DeleteBucket([]byte(strVal)); err != nil {
				return err
			}
		}
	}
	return nil
}
