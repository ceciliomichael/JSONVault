package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
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

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

	collectionPath := filepath.Join(s.root, database, collection)
	if err := os.MkdirAll(collectionPath, 0o700); err != nil {
		return Document{}, fmt.Errorf("create collection: %w", err)
	}

	var id string
	var path string
	for attempts := 0; attempts < 16; attempts++ {
		id, err = generateID()
		if err != nil {
			return Document{}, err
		}
		path = filepath.Join(collectionPath, id+".json")
		_, statErr := os.Stat(path)
		if errors.Is(statErr, os.ErrNotExist) {
			break
		}
		if statErr != nil {
			return Document{}, fmt.Errorf("inspect document: %w", statErr)
		}
		if attempts == 15 {
			return Document{}, fmt.Errorf("generate document id: exhausted collision retries")
		}
	}

	if err := writeAtomic(path, data); err != nil {
		return Document{}, err
	}
	s.cache.Set(cacheKey(database, collection, id), data)
	return Document{ID: id, Document: json.RawMessage(data)}, nil
}

func (s *Store) ListDocuments(database, collection string) ([]Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, err
	}

	lock := s.locks.For(database, collection)
	lock.RLock()
	defer lock.RUnlock()

	collectionPath := filepath.Join(s.root, database, collection)
	entries, err := os.ReadDir(collectionPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("list documents: %w", err)
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

	documents := make([]Document, 0, len(ids))
	for _, id := range ids {
		doc, err := s.readDocumentLocked(database, collection, id)
		if err != nil {
			return nil, err
		}
		documents = append(documents, doc)
	}
	return documents, nil
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

	lock := s.locks.For(database, collection)
	lock.RLock()
	defer lock.RUnlock()

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

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

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

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

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
