package store

import (
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/xeipuuv/gojsonschema"
	bolt "go.etcd.io/bbolt"
)

var ErrSchemaValidation = errors.New("schema validation failed")

const schemaBucketPrefix = "_schemas"
const maxCachedSchemas = 1024

type cachedSchema struct {
	fingerprint [32]byte
	schema      *gojsonschema.Schema
}

func getSchemaBucketName() []byte {
	return []byte(schemaBucketPrefix)
}

func getSchemaTx(tx *bolt.Tx, collection string) []byte {
	schemaBucket := tx.Bucket(getSchemaBucketName())
	if schemaBucket == nil {
		return nil
	}
	return schemaBucket.Get([]byte(collection))
}

func deleteSchemaTx(tx *bolt.Tx, collection string) error {
	schemaBucket := tx.Bucket(getSchemaBucketName())
	if schemaBucket == nil {
		return nil
	}
	return schemaBucket.Delete([]byte(collection))
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
	if len(schema) > 0 {
		if _, err := gojsonschema.NewSchema(gojsonschema.NewBytesLoader(schema)); err != nil {
			return fmt.Errorf("schema validation error: %w", err)
		}
	}

	err = db.Update(func(tx *bolt.Tx) error {
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
	if err != nil {
		return err
	}
	s.invalidateSchemaCache(database, collection)
	return nil
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
	return s.validateDocumentWithSchema(database, collection, schemaBytes, doc)
}

func validateDocumentWithSchema(schemaBytes, doc []byte) error {
	if schemaBytes == nil {
		return nil // No schema attached
	}

	schema, err := gojsonschema.NewSchema(gojsonschema.NewBytesLoader(schemaBytes))
	if err != nil {
		return fmt.Errorf("schema validation error: %w", err)
	}
	return validateDocumentWithCompiledSchema(schema, doc)
}

func (s *Store) validateDocumentWithSchema(database, collection string, schemaBytes, doc []byte) error {
	if schemaBytes == nil {
		return nil
	}

	cacheKey := database + "\x00" + collection
	fingerprint := sha256.Sum256(schemaBytes)

	s.schemaMu.RLock()
	cached, ok := s.schemaCache[cacheKey]
	s.schemaMu.RUnlock()
	if ok && cached.fingerprint == fingerprint {
		return validateDocumentWithCompiledSchema(cached.schema, doc)
	}

	schema, err := gojsonschema.NewSchema(gojsonschema.NewBytesLoader(schemaBytes))
	if err != nil {
		return fmt.Errorf("schema validation error: %w", err)
	}

	s.schemaMu.Lock()
	if len(s.schemaCache) >= maxCachedSchemas {
		for key := range s.schemaCache {
			delete(s.schemaCache, key)
			break
		}
	}
	s.schemaCache[cacheKey] = cachedSchema{fingerprint: fingerprint, schema: schema}
	s.schemaMu.Unlock()

	return validateDocumentWithCompiledSchema(schema, doc)
}

func validateDocumentWithCompiledSchema(schema *gojsonschema.Schema, doc []byte) error {
	documentLoader := gojsonschema.NewBytesLoader(doc)

	result, err := schema.Validate(documentLoader)
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

func (s *Store) invalidateSchemaCache(database, collection string) {
	s.schemaMu.Lock()
	defer s.schemaMu.Unlock()
	delete(s.schemaCache, database+"\x00"+collection)
}
