package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	stdjson "encoding/json"
	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

func (s *Store) ListDocuments(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}) ([]Document, int, error) {
	ctx = contextOrBackground(ctx)
	if err := ctx.Err(); err != nil {
		return nil, 0, err
	}
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

	documents := []Document{}
	var total int
	var matched int

	err = db.View(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}

		total = getCollectionCountTx(tx, collection, b)

		var indexedField, indexedValue string
		if len(filter) > 0 {
			indexes := getIndexedFieldsTx(tx, collection)
			for _, idx := range indexes {
				if val, ok := filter[idx]; ok {
					indexedField = idx
					indexedValue = encodeIndexValue(val)
					break
				}
			}
		}

		if indexedField != "" {
			// Fast path: use secondary index
			idxBucketName := getIndexBucketName(collection, indexedField)
			idxBucket := tx.Bucket(idxBucketName)
			if idxBucket != nil {
				valBucket := idxBucket.Bucket([]byte(indexedValue))
				if valBucket != nil {
					c := valBucket.Cursor()

					if len(filter) == 1 {
						// Single filter exact match: all items in this bucket match.
						matched = valBucket.Stats().KeyN
						var seen int
						for k, _ := c.First(); k != nil; k, _ = c.Next() {
							if err := ctx.Err(); err != nil {
								return err
							}
							if len(documents) >= limit {
								break
							}
							if seen >= offset {
								v := b.Get(k)
								if v == nil {
									continue
								}
								plaintext, err := decryptDocument(v, s.encryptionKey)
								if err != nil {
									return fmt.Errorf("corrupt document (decrypt): %w", err)
								}
								documents = append(documents, Document{
									ID:       string(k),
									Document: stdjson.RawMessage(plaintext),
									ETag:     computeETag(plaintext),
								})
							}
							seen++
						}
					} else {
						// Multi-filter: need to decrypt and evaluate remaining filters
						for k, _ := c.First(); k != nil; k, _ = c.Next() {
							if err := ctx.Err(); err != nil {
								return err
							}
							v := b.Get(k)
							if v == nil {
								continue
							}
							plaintext, err := decryptDocument(v, s.encryptionKey)
							if err != nil {
								return fmt.Errorf("corrupt document (decrypt): %w", err)
							}

							matches := true
							var parsed map[string]interface{}
							if err := sonic.Unmarshal(plaintext, &parsed); err == nil {
								for fk, fv := range filter {
									if fk == indexedField {
										continue
									}
									val, exists := parsed[fk]
									if !exists || encodeIndexValue(val) != encodeIndexValue(fv) {
										matches = false
										break
									}
								}
							} else {
								matches = false
							}

							if matches {
								if matched >= offset && len(documents) < limit {
									documents = append(documents, Document{
										ID:       string(k),
										Document: stdjson.RawMessage(plaintext),
										ETag:     computeETag(plaintext),
									})
								}
								matched++
							}
						}
					}
				}
			}
		} else {
			// Slow path: full collection scan
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				if err := ctx.Err(); err != nil {
					return err
				}
				if len(documents) >= limit {
					if len(filter) == 0 {
						break
					}
				}

				plaintext, err := decryptDocument(v, s.encryptionKey)
				if err != nil {
					return fmt.Errorf("corrupt document (decrypt): %w", err)
				}

				matches := true
				if len(filter) > 0 {
					var parsed map[string]interface{}
					if err := sonic.Unmarshal(plaintext, &parsed); err == nil {
						for fk, fv := range filter {
							val, exists := parsed[fk]
							if !exists || encodeIndexValue(val) != encodeIndexValue(fv) {
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
							Document: stdjson.RawMessage(plaintext),
							ETag:     computeETag(plaintext),
						})
					}
					matched++
				}
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

	var doc Document
	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}

		data := b.Get([]byte(id))
		if data == nil {
			return ErrNotFound
		}

		plaintext, err := decryptDocument(data, s.encryptionKey)
		if err != nil {
			return fmt.Errorf("corrupt document (decrypt): %w", err)
		}

		// make a copy because data is only valid during the transaction
		docData := make([]byte, len(plaintext))
		copy(docData, plaintext)

		doc = Document{
			ID:       id,
			Document: docData,
			ETag:     computeETag(docData),
		}
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("get document: %w", err)
	}

	return doc, nil
}
