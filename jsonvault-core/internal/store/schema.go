package store

import (
	"errors"
	"fmt"

	"github.com/xeipuuv/gojsonschema"
	bolt "go.etcd.io/bbolt"
)

var ErrSchemaValidation = errors.New("schema validation failed")

const schemaBucketPrefix = "_schemas"

func getSchemaBucketName() []byte {
	return []byte(schemaBucketPrefix)
}

// SetSchema saves a JSON schema for a collection.
// If schema is empty or nil, it removes the schema.
func (s *Store) SetSchema(database, collection string, schema []byte) error {
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
		// Ensure collection exists
		if tx.Bucket([]byte(collection)) == nil {
			return ErrNotFound
		}

		schemaBucket, err := tx.CreateBucketIfNotExists(getSchemaBucketName())
		if err != nil {
			return err
		}

		if len(schema) == 0 {
			return schemaBucket.Delete([]byte(collection))
		}

		return schemaBucket.Put([]byte(collection), schema)
	})
}

// GetSchema retrieves the JSON schema for a collection.
// Returns nil, nil if no schema is attached.
func (s *Store) GetSchema(database, collection string) ([]byte, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, err
	}

	db, err := s.getDB(database)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}

	var schema []byte
	err = db.View(func(tx *bolt.Tx) error {
		schemaBucket := tx.Bucket(getSchemaBucketName())
		if schemaBucket == nil {
			return nil
		}
		data := schemaBucket.Get([]byte(collection))
		if data != nil {
			// Copy data out of the transaction
			schema = make([]byte, len(data))
			copy(schema, data)
		}
		return nil
	})

	return schema, err
}

// ValidateDocument checks if a JSON document complies with the collection's schema.
// Returns an error containing all schema violations if invalid.
func (s *Store) ValidateDocument(database, collection string, doc []byte) error {
	schemaBytes, err := s.GetSchema(database, collection)
	if err != nil {
		return err // db might not exist, etc.
	}
	if schemaBytes == nil {
		return nil // No schema attached
	}

	schemaLoader := gojsonschema.NewBytesLoader(schemaBytes)
	documentLoader := gojsonschema.NewBytesLoader(doc)

	result, err := gojsonschema.Validate(schemaLoader, documentLoader)
	if err != nil {
		return fmt.Errorf("schema validation error: %w", err)
	}

	if !result.Valid() {
		var errs []string
		for _, desc := range result.Errors() {
			errs = append(errs, desc.String())
		}
		return fmt.Errorf("%w: %v", ErrSchemaValidation, errs)
	}

	return nil
}
