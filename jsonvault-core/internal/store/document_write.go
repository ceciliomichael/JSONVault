package store

import (
	"errors"
	"fmt"
	stdjson "encoding/json"
	
	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

func (s *Store) CreateDocument(database, collection string, body []byte) (Document, error) {
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

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	var id string
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

		return b.Put([]byte(id), data)
	})

	if err != nil {
		return Document{}, fmt.Errorf("create document: %w", err)
	}

	return Document{ID: id, Document: stdjson.RawMessage(data)}, nil
}

func (s *Store) PutDocument(database, collection, id string, body []byte) (Document, error) {
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

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}
		if b.Get([]byte(id)) == nil {
			return ErrNotFound
		}
		return b.Put([]byte(id), data)
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("put document: %w", err)
	}

	return Document{ID: id, Document: stdjson.RawMessage(data)}, nil
}

func (s *Store) PatchDocument(database, collection, id string, body []byte) (Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return Document{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return Document{}, err
	}
	if err := ValidateDocumentID(id); err != nil {
		return Document{}, err
	}
	if !sonic.ConfigDefault.Valid(body) {
		return Document{}, ErrInvalidJSON
	}

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	var data []byte
	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}
		existingData := b.Get([]byte(id))
		if existingData == nil {
			return ErrNotFound
		}

		var existing map[string]interface{}
		if err := sonic.Unmarshal(existingData, &existing); err != nil {
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

		return b.Put([]byte(id), data)
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("patch document: %w", err)
	}

	return Document{ID: id, Document: stdjson.RawMessage(data)}, nil
}

func (s *Store) DeleteDocument(database, collection, id string) error {
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

	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}
		if b.Get([]byte(id)) == nil {
			return ErrNotFound
		}
		return b.Delete([]byte(id))
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete document: %w", err)
	}

	return nil
}
