package store

import (
	stdjson "encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

func (s *Store) CreateDocument(database, collection string, body []byte) (Document, error) {
	return s.CreateDocumentWithTTL(database, collection, body, 0)
}

func (s *Store) CreateDocumentWithTTL(database, collection string, body []byte, expireIn time.Duration) (Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return Document{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return Document{}, err
	}
	data, err := normalizeJSON(body)
	if err != nil {
		return Document{}, err
	}
	if err := s.enforceDocumentSize(data); err != nil {
		return Document{}, err
	}
	if err := s.ValidateDocument(database, collection, data); err != nil {
		return Document{}, err
	}
	encryptedData, err := encryptDocument(data, s.encryptionKey)
	if err != nil {
		return Document{}, err
	}

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	var id string
	var event Event
	err = db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte(collection))
		if err != nil {
			return err
		}

		for attempts := 0; attempts < 16; attempts++ {
			id, err = generateID()
			if err != nil {
				return err
			}
			if b.Get([]byte(id)) == nil {
				break
			}
			if attempts == 15 {
				return fmt.Errorf("generate document id: exhausted collision retries")
			}
		}

		if err := incrementCollectionCountTx(tx, collection, 1, b); err != nil {
			return err
		}
		if err := b.Put([]byte(id), encryptedData); err != nil {
			return err
		}
		if expireIn > 0 {
			if err := setDocumentTTL(tx, collection, id, expireIn); err != nil {
				return err
			}
		}
		if err := indexDocumentTx(tx, collection, id, data); err != nil {
			return err
		}
		recorded, recordErr := recordEventTx(tx, Event{
			Action:     "insert",
			Database:   database,
			Collection: collection,
			DocumentID: id,
			ETag:       computeETag(data),
			Document:   stdjson.RawMessage(data),
		})
		if recordErr != nil {
			return recordErr
		}
		event = recorded
		return nil
	})

	if err != nil {
		return Document{}, fmt.Errorf("create document: %w", err)
	}

	doc := Document{ID: id, Document: stdjson.RawMessage(data), ETag: computeETag(data)}
	s.PublishEvent(event)
	return doc, nil
}

func (s *Store) PutDocument(database, collection, id string, body []byte, expectedETag string) (Document, error) {
	return s.PutDocumentWithTTL(database, collection, id, body, expectedETag, 0)
}

func (s *Store) PutDocumentWithTTL(database, collection, id string, body []byte, expectedETag string, expireIn time.Duration) (Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return Document{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return Document{}, err
	}
	if err := ValidateDocumentID(id); err != nil {
		return Document{}, err
	}
	data, err := normalizeJSON(body)
	if err != nil {
		return Document{}, err
	}
	if err := s.enforceDocumentSize(data); err != nil {
		return Document{}, err
	}
	if err := s.ValidateDocument(database, collection, data); err != nil {
		return Document{}, err
	}
	encryptedData, err := encryptDocument(data, s.encryptionKey)
	if err != nil {
		return Document{}, err
	}

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	var isInsert bool
	var event Event

	err = db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte(collection))
		if err != nil {
			return err
		}

		existingData := b.Get([]byte(id))
		if existingData != nil {
			existingPlaintext, err := decryptDocument(existingData, s.encryptionKey, s.encryptionRequired)
			if err != nil {
				return fmt.Errorf("corrupt document (decrypt): %w", err)
			}

			if expectedETag != "" && !matchETags(computeETag(existingPlaintext), expectedETag) {
				return ErrPreconditionFailed
			}
			if err := unindexDocumentTx(tx, collection, id, existingPlaintext); err != nil {
				return fmt.Errorf("unindex old document: %w", err)
			}
		} else {
			if expectedETag != "" && expectedETag != "*" {
				return ErrPreconditionFailed
			}
			isInsert = true
			if err := incrementCollectionCountTx(tx, collection, 1, b); err != nil {
				return err
			}
		}

		if err := b.Put([]byte(id), encryptedData); err != nil {
			return err
		}
		if expireIn > 0 {
			if err := setDocumentTTL(tx, collection, id, expireIn); err != nil {
				return err
			}
		} else {
			if err := clearDocumentTTL(tx, collection, id); err != nil {
				return err
			}
		}
		if err := indexDocumentTx(tx, collection, id, data); err != nil {
			return err
		}

		action := "update"
		if isInsert {
			action = "insert"
		}
		recorded, recordErr := recordEventTx(tx, Event{
			Action:     action,
			Database:   database,
			Collection: collection,
			DocumentID: id,
			ETag:       computeETag(data),
			Document:   stdjson.RawMessage(data),
		})
		if recordErr != nil {
			return recordErr
		}
		event = recorded
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrPreconditionFailed) {
			return Document{}, ErrPreconditionFailed
		}
		return Document{}, fmt.Errorf("put document: %w", err)
	}

	doc := Document{ID: id, Document: stdjson.RawMessage(data), ETag: computeETag(data)}

	s.PublishEvent(event)
	return doc, nil
}

func (s *Store) PatchDocument(database, collection, id string, body []byte, expectedETag string) (Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return Document{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return Document{}, err
	}
	if err := ValidateDocumentID(id); err != nil {
		return Document{}, err
	}
	if err := s.enforceDocumentSize(body); err != nil {
		return Document{}, err
	}
	if !sonic.ConfigDefault.Valid(body) {
		return Document{}, ErrInvalidJSON
	}

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	var data []byte
	var event Event
	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}
		existingData := b.Get([]byte(id))
		if existingData == nil {
			return ErrNotFound
		}

		existingPlaintext, err := decryptDocument(existingData, s.encryptionKey, s.encryptionRequired)
		if err != nil {
			return fmt.Errorf("corrupt document (decrypt): %w", err)
		}

		if expectedETag != "" && !matchETags(computeETag(existingPlaintext), expectedETag) {
			return ErrPreconditionFailed
		}

		var existing map[string]interface{}
		if err := sonic.Unmarshal(existingPlaintext, &existing); err != nil {
			return fmt.Errorf("corrupt document: %w", err)
		}

		var patch map[string]interface{}
		if err := sonic.Unmarshal(body, &patch); err != nil {
			return ErrInvalidJSON
		}

		for k, v := range patch {
			existing[k] = v
		}

		mergedData, err := sonic.Marshal(existing)
		if err != nil {
			return fmt.Errorf("marshal merged document: %w", err)
		}

		data, err = normalizeJSON(mergedData)
		if err != nil {
			return err
		}
		if err := s.enforceDocumentSize(data); err != nil {
			return err
		}
		if err := s.validateDocumentWithSchema(database, collection, getSchemaTx(tx, collection), data); err != nil {
			return err
		}

		encryptedData, err := encryptDocument(data, s.encryptionKey)
		if err != nil {
			return err
		}

		if err := unindexDocumentTx(tx, collection, id, existingPlaintext); err != nil {
			return fmt.Errorf("unindex old document: %w", err)
		}
		if err := b.Put([]byte(id), encryptedData); err != nil {
			return err
		}
		if err := indexDocumentTx(tx, collection, id, data); err != nil {
			return err
		}
		recorded, recordErr := recordEventTx(tx, Event{
			Action:     "update",
			Database:   database,
			Collection: collection,
			DocumentID: id,
			ETag:       computeETag(data),
			Document:   stdjson.RawMessage(data),
		})
		if recordErr != nil {
			return recordErr
		}
		event = recorded
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("patch document: %w", err)
	}

	doc := Document{ID: id, Document: stdjson.RawMessage(data), ETag: computeETag(data)}
	s.PublishEvent(event)
	return doc, nil
}

func (s *Store) DeleteDocument(database, collection, id string, expectedETag string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}
	if err := ValidateDocumentID(id); err != nil {
		return err
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	var event Event
	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}
		existingData := b.Get([]byte(id))
		if existingData == nil {
			return ErrNotFound
		}

		existingPlaintext, err := decryptDocument(existingData, s.encryptionKey, s.encryptionRequired)
		if err != nil {
			return fmt.Errorf("corrupt document (decrypt): %w", err)
		}

		if expectedETag != "" && !matchETags(computeETag(existingPlaintext), expectedETag) {
			return ErrPreconditionFailed
		}
		if err := incrementCollectionCountTx(tx, collection, -1, b); err != nil {
			return err
		}
		if err := clearDocumentTTL(tx, collection, id); err != nil {
			return err
		}
		if err := b.Delete([]byte(id)); err != nil {
			return err
		}
		if err := unindexDocumentTx(tx, collection, id, existingPlaintext); err != nil {
			return err
		}
		recorded, recordErr := recordEventTx(tx, Event{
			Action:     "delete",
			Database:   database,
			Collection: collection,
			DocumentID: id,
		})
		if recordErr != nil {
			return recordErr
		}
		event = recorded
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete document: %w", err)
	}

	s.PublishEvent(event)

	return nil
}
