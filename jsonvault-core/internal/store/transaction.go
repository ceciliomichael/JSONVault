package store

import (
	stdjson "encoding/json"
	"errors"
	"fmt"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

// ExecuteTransaction executes multiple document operations atomically.
// If any operation fails, the entire transaction is rolled back.
func (s *Store) ExecuteTransaction(database string, ops []TransactionOp) ([]Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}

	if len(ops) == 0 {
		return nil, errors.New("transaction must contain at least one operation")
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	var results []Document
	var events []Event

	err = db.Update(func(tx *bolt.Tx) error {
		for i, op := range ops {
			collection := op.Collection
			if err := ValidateCollectionName(collection); err != nil {
				return fmt.Errorf("op[%d] invalid collection: %w", i, err)
			}
			if err := ValidateDocumentID(op.ID); err != nil {
				return fmt.Errorf("op[%d] invalid id: %w", i, err)
			}

			b, err := tx.CreateBucketIfNotExists([]byte(collection))
			if err != nil {
				return fmt.Errorf("op[%d] create bucket: %w", i, err)
			}

			switch op.Action {
			case "put":
				data, err := normalizeJSON(op.Body)
				if err != nil {
					return fmt.Errorf("op[%d] normalize json: %w", i, err)
				}
				if err := s.ValidateDocument(database, collection, data); err != nil {
					return fmt.Errorf("op[%d] %w", i, err)
				}

				existingData := b.Get([]byte(op.ID))
				var isNew bool
				if existingData == nil {
					isNew = true
					if op.ExpectedETag != "" {
						return fmt.Errorf("op[%d]: %w (expected etag but document does not exist)", i, ErrPreconditionFailed)
					}
					if err := incrementCollectionCountTx(tx, collection, 1, b); err != nil {
						return fmt.Errorf("op[%d] count: %w", i, err)
					}
				} else {
					existingPlaintext, err := decryptDocument(existingData, s.encryptionKey)
					if err != nil {
						return fmt.Errorf("op[%d] decrypt: %w", i, err)
					}
					if op.ExpectedETag != "" && !matchETags(computeETag(existingPlaintext), op.ExpectedETag) {
						return fmt.Errorf("op[%d]: %w", i, ErrPreconditionFailed)
					}
					if err := unindexDocumentTx(tx, collection, op.ID, existingPlaintext); err != nil {
						return fmt.Errorf("op[%d] unindex: %w", i, err)
					}
				}

				encryptedData, err := encryptDocument(data, s.encryptionKey)
				if err != nil {
					return fmt.Errorf("op[%d] encrypt: %w", i, err)
				}

				if err := b.Put([]byte(op.ID), encryptedData); err != nil {
					return fmt.Errorf("op[%d] put: %w", i, err)
				}
				if err := indexDocumentTx(tx, collection, op.ID, data); err != nil {
					return fmt.Errorf("op[%d] index: %w", i, err)
				}

				doc := Document{ID: op.ID, Document: stdjson.RawMessage(data), ETag: computeETag(data)}
				results = append(results, doc)

				action := "update"
				if isNew {
					action = "insert"
				}
				events = append(events, Event{
					Action:     action,
					Database:   database,
					Collection: collection,
					DocumentID: op.ID,
					ETag:       doc.ETag,
					Document:   doc.Document,
				})

			case "patch":
				existingData := b.Get([]byte(op.ID))
				if existingData == nil {
					return fmt.Errorf("op[%d] not found", i)
				}
				existingPlaintext, err := decryptDocument(existingData, s.encryptionKey)
				if err != nil {
					return fmt.Errorf("op[%d] decrypt: %w", i, err)
				}
				if op.ExpectedETag != "" && !matchETags(computeETag(existingPlaintext), op.ExpectedETag) {
					return fmt.Errorf("op[%d]: %w", i, ErrPreconditionFailed)
				}

				var existing map[string]interface{}
				if err := sonic.Unmarshal(existingPlaintext, &existing); err != nil {
					return fmt.Errorf("op[%d] corrupt document: %w", i, err)
				}

				var patch map[string]interface{}
				if err := sonic.Unmarshal(op.Body, &patch); err != nil {
					return fmt.Errorf("op[%d] invalid json patch", i)
				}

				for k, v := range patch {
					existing[k] = v
				}

				mergedData, err := sonic.Marshal(existing)
				if err != nil {
					return fmt.Errorf("op[%d] marshal merged: %w", i, err)
				}

				data, err := normalizeJSON(mergedData)
				if err != nil {
					return fmt.Errorf("op[%d] normalize merged: %w", i, err)
				}
				if err := s.ValidateDocument(database, collection, data); err != nil {
					return fmt.Errorf("op[%d] %w", i, err)
				}

				encryptedData, err := encryptDocument(data, s.encryptionKey)
				if err != nil {
					return fmt.Errorf("op[%d] encrypt: %w", i, err)
				}

				if err := unindexDocumentTx(tx, collection, op.ID, existingPlaintext); err != nil {
					return fmt.Errorf("op[%d] unindex: %w", i, err)
				}
				if err := b.Put([]byte(op.ID), encryptedData); err != nil {
					return fmt.Errorf("op[%d] put: %w", i, err)
				}
				if err := indexDocumentTx(tx, collection, op.ID, data); err != nil {
					return fmt.Errorf("op[%d] index: %w", i, err)
				}

				doc := Document{ID: op.ID, Document: stdjson.RawMessage(data), ETag: computeETag(data)}
				results = append(results, doc)

				events = append(events, Event{
					Action:     "update",
					Database:   database,
					Collection: collection,
					DocumentID: op.ID,
					ETag:       doc.ETag,
					Document:   doc.Document,
				})

			case "delete":
				existingData := b.Get([]byte(op.ID))
				if existingData == nil {
					return fmt.Errorf("op[%d] not found", i)
				}
				existingPlaintext, err := decryptDocument(existingData, s.encryptionKey)
				if err != nil {
					return fmt.Errorf("op[%d] decrypt: %w", i, err)
				}
				if op.ExpectedETag != "" && !matchETags(computeETag(existingPlaintext), op.ExpectedETag) {
					return fmt.Errorf("op[%d]: %w", i, ErrPreconditionFailed)
				}

				if err := incrementCollectionCountTx(tx, collection, -1, b); err != nil {
					return fmt.Errorf("op[%d] count: %w", i, err)
				}
				if err := b.Delete([]byte(op.ID)); err != nil {
					return fmt.Errorf("op[%d] delete: %w", i, err)
				}
				if err := unindexDocumentTx(tx, collection, op.ID, existingPlaintext); err != nil {
					return fmt.Errorf("op[%d] unindex: %w", i, err)
				}

				results = append(results, Document{ID: op.ID})

				events = append(events, Event{
					Action:     "delete",
					Database:   database,
					Collection: collection,
					DocumentID: op.ID,
				})

			default:
				return fmt.Errorf("op[%d] invalid action '%s'", i, op.Action)
			}
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("transaction failed: %w", err)
	}

	// Publish all events ONLY after the transaction successfully commits
	for _, event := range events {
		s.PublishEvent(event)
	}

	return results, nil
}
