package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	stdjson "encoding/json"
	"github.com/bytedance/sonic"
)

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
		        if err := sonic.Unmarshal(doc.Document, &parsed); err == nil {
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

func (s *Store) readDocumentLocked(database, collection, id string) (Document, error) {
	key := cacheKey(database, collection, id)
	if data, ok := s.cache.Get(key); ok {
		return Document{ID: id, Document: stdjson.RawMessage(data)}, nil
	}

	path := filepath.Join(s.root, database, collection, id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("read document: %w", err)
	}
	if !sonic.ConfigDefault.Valid(data) {
		return Document{}, fmt.Errorf("%w: stored document %s/%s/%s is corrupt", ErrInvalidJSON, database, collection, id)
	}
	s.cache.Set(key, data)
	return Document{ID: id, Document: stdjson.RawMessage(data)}, nil
}
