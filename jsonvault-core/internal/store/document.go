package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
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
	return Document{ID: id, Document: json.RawMessage(data)}, nil
}

func (s *Store) ListDocuments(database, collection string, limit, offset int, filter map[string]string) ([]Document, int, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, 0, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, 0, err
	}

	colLock := s.locks.ForCollection(database, collection)
	colLock.RLock()
	defer colLock.RUnlock()

	collectionPath := filepath.Join(s.root, database, collection)
	entries, err := os.ReadDir(collectionPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, ErrNotFound
		}
		return nil, 0, fmt.Errorf("list documents: %w", err)
	}

	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		if err := ValidateDocumentID(id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)

	documents := make([]Document, 0)
	total := len(ids)
	
	if limit <= 0 {
	    limit = 100 // default limit
	}
	
	matched := 0
	for _, id := range ids {
		if len(documents) >= limit {
			break
		}
		
		docLock := s.locks.ForDocument(database, collection, id)
		docLock.RLock()
		doc, err := s.readDocumentLocked(database, collection, id)
		docLock.RUnlock()
		
		if err != nil {
		    if errors.Is(err, ErrNotFound) {
		        continue
		    }
			return nil, 0, err
		}
		
		// Apply filter
		matches := true
		if len(filter) > 0 {
		    var parsed map[string]interface{}
		    if err := json.Unmarshal(doc.Document, &parsed); err == nil {
		        for k, v := range filter {
		            val, exists := parsed[k]
		            if !exists || fmt.Sprintf("%v", val) != v {
		                matches = false
		                break
		            }
		        }
		    } else {
		        matches = false
		    }
		}
		
		if matches {
		    if matched >= offset {
		        documents = append(documents, doc)
		    }
		    matched++
		}
	}
	
	if len(filter) > 0 {
	    total = matched // If filtering, total is the number of matching documents found so far (approximate if we hit limit)
	    // To get exact total for filtered we would have to scan all. We skip that for performance.
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

	colLock := s.locks.ForCollection(database, collection)
	colLock.RLock()
	defer colLock.RUnlock()
	
	docLock := s.locks.ForDocument(database, collection, id)
	docLock.RLock()
	defer docLock.RUnlock()

	return s.readDocumentLocked(database, collection, id)
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
	return Document{ID: id, Document: json.RawMessage(data)}, nil
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
	if !json.Valid(body) {
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
	if err := json.Unmarshal(doc.Document, &existing); err != nil {
	    return Document{}, fmt.Errorf("corrupt document: %w", err)
	}
	
	// Parse patch
	var patch map[string]interface{}
	if err := json.Unmarshal(body, &patch); err != nil {
	    return Document{}, ErrInvalidJSON
	}
	
	// Merge patch into existing
	for k, v := range patch {
	    existing[k] = v
	}
	
	// Re-marshal
	mergedData, err := json.Marshal(existing)
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
	return Document{ID: id, Document: json.RawMessage(data)}, nil
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

func (s *Store) readDocumentLocked(database, collection, id string) (Document, error) {
	key := cacheKey(database, collection, id)
	if data, ok := s.cache.Get(key); ok {
		return Document{ID: id, Document: json.RawMessage(data)}, nil
	}

	path := filepath.Join(s.root, database, collection, id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("read document: %w", err)
	}
	if !json.Valid(data) {
		return Document{}, fmt.Errorf("%w: stored document %s/%s/%s is corrupt", ErrInvalidJSON, database, collection, id)
	}
	s.cache.Set(key, data)
	return Document{ID: id, Document: json.RawMessage(data)}, nil
}
