package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	
	stdjson "encoding/json"
	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

func (s *Store) ListDocuments(database, collection string, limit, offset int, filter map[string]string) ([]Document, int, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, 0, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, 0, err
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, ErrNotFound
		}
		return nil, 0, fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, 0, err
	}

	if limit <= 0 {
		limit = 100
	}

	var documents []Document
	var total int
	var matched int

	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}

		c := b.Cursor()
		
		total = b.Stats().KeyN

		for k, v := c.First(); k != nil; k, v = c.Next() {
			if len(documents) >= limit {
				if len(filter) == 0 {
					break
				}
			}

			matches := true
			if len(filter) > 0 {
				var parsed map[string]interface{}
				if err := sonic.Unmarshal(v, &parsed); err == nil {
					for fk, fv := range filter {
						val, exists := parsed[fk]
						if !exists || fmt.Sprintf("%v", val) != fv {
							matches = false
							break
						}
					}
				} else {
					matches = false
				}
			}

			if matches {
				if matched >= offset && len(documents) < limit {
					documents = append(documents, Document{
						ID:       string(k),
						Document: stdjson.RawMessage(v),
					})
				}
				matched++
			}
		}
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, 0, ErrNotFound
		}
		return nil, 0, fmt.Errorf("list documents: %w", err)
	}

	// Deep copy required because slices inside bolt.Tx become invalid after tx closes
	for i := range documents {
	    clone := make([]byte, len(documents[i].Document))
	    copy(clone, documents[i].Document)
	    documents[i].Document = stdjson.RawMessage(clone)
	}

	if len(filter) > 0 {
		total = matched
	}

	return documents, total, nil
}

func (s *Store) GetDocument(database, collection, id string) (Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return Document{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return Document{}, err
	}
	if err := ValidateDocumentID(id); err != nil {
		return Document{}, err
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	var docData []byte
	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}
		v := b.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		// Copy bytes
		docData = make([]byte, len(v))
		copy(docData, v)
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("get document: %w", err)
	}

	return Document{ID: id, Document: stdjson.RawMessage(docData)}, nil
}
