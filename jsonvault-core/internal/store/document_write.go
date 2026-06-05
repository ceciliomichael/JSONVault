package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	
	stdjson "encoding/json"
	"github.com/bytedance/sonic"
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

	colLock := s.locks.ForCollection(database, collection)
	colLock.RLock()
	defer colLock.RUnlock()

	collectionPath := filepath.Join(s.root, database, collection)
	if err := os.MkdirAll(collectionPath, 0o700); err != nil {
		return Document{}, fmt.Errorf("create collection: %w", err)
	}

	var id string
	var path string
	var docLock *sync.RWMutex
	for attempts := 0; attempts < 16; attempts++ {
		id, err = generateID()
		if err != nil {
			return Document{}, err
		}
		
		docLock = s.locks.ForDocument(database, collection, id)
		docLock.Lock()
		
		path = filepath.Join(collectionPath, id+".json")
		_, statErr := os.Stat(path)
		if errors.Is(statErr, os.ErrNotExist) {
			break
		}
		docLock.Unlock() // unlock if collision
		
		if statErr != nil {
			return Document{}, fmt.Errorf("inspect document: %w", statErr)
		}
		if attempts == 15 {
			return Document{}, fmt.Errorf("generate document id: exhausted collision retries")
		}
	}
	defer docLock.Unlock()

	if err := writeAtomic(path, data); err != nil {
		return Document{}, err
	}
	s.cache.Set(cacheKey(database, collection, id), data)
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

	colLock := s.locks.ForCollection(database, collection)
	colLock.RLock()
	defer colLock.RUnlock()
	
	docLock := s.locks.ForDocument(database, collection, id)
	docLock.Lock()
	defer docLock.Unlock()

	path := filepath.Join(s.root, database, collection, id+".json")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("inspect document: %w", err)
	}
	if err := writeAtomic(path, data); err != nil {
		return Document{}, err
	}
	s.cache.Set(cacheKey(database, collection, id), data)
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
	
	// Ensure the patch body is valid JSON
	if !sonic.ConfigDefault.Valid(body) {
		return Document{}, ErrInvalidJSON
	}

	colLock := s.locks.ForCollection(database, collection)
	colLock.RLock()
	defer colLock.RUnlock()
	
	docLock := s.locks.ForDocument(database, collection, id)
	docLock.Lock()
	defer docLock.Unlock()

    // Read existing
	doc, err := s.readDocumentLocked(database, collection, id)
	if err != nil {
	    return Document{}, err
	}
	
	// Parse existing
	var existing map[string]interface{}
	if err := sonic.Unmarshal(doc.Document, &existing); err != nil {
	    return Document{}, fmt.Errorf("corrupt document: %w", err)
	}
	
	// Parse patch
	var patch map[string]interface{}
	if err := sonic.Unmarshal(body, &patch); err != nil {
	    return Document{}, ErrInvalidJSON
	}
	
	// Merge patch into existing
	for k, v := range patch {
	    existing[k] = v
	}
	
	// Re-marshal
	mergedData, err := sonic.Marshal(existing)
	if err != nil {
	    return Document{}, fmt.Errorf("marshal merged document: %w", err)
	}
	
	data, err := normalizeJSON(mergedData)
	if err != nil {
		return Document{}, err
	}

	path := filepath.Join(s.root, database, collection, id+".json")
	if err := writeAtomic(path, data); err != nil {
		return Document{}, err
	}
	s.cache.Set(cacheKey(database, collection, id), data)
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

	colLock := s.locks.ForCollection(database, collection)
	colLock.RLock()
	defer colLock.RUnlock()
	
	docLock := s.locks.ForDocument(database, collection, id)
	docLock.Lock()
	defer docLock.Unlock()

	path := filepath.Join(s.root, database, collection, id+".json")
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("delete document: %w", err)
	}
	s.cache.Delete(cacheKey(database, collection, id))
	return nil
}
