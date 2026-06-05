package store

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Store struct {
	root  string
	cache *LRUCache
	locks *LockManager
}

type Document struct {
	ID       string          `json:"id"`
	Document json.RawMessage `json:"document"`
}

func New(root string, cacheEntries int) (*Store, error) {
	if strings.TrimSpace(root) == "" {
		return nil, fmt.Errorf("data directory cannot be empty")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve data directory: %w", err)
	}
	if err := os.MkdirAll(absRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	s := &Store{
		root:  absRoot,
		cache: NewLRUCache(cacheEntries),
		locks: NewLockManager(),
	}
	s.cleanupOrphanedTempFiles()
	return s, nil
}

func (s *Store) CreateDatabase(name string) (bool, error) {
	if err := ValidateDatabaseName(name); err != nil {
		return false, err
	}

	path := filepath.Join(s.root, name)
	_, statErr := os.Stat(path)
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return false, fmt.Errorf("inspect database: %w", statErr)
	}
	if err := os.MkdirAll(path, 0o700); err != nil {
		return false, fmt.Errorf("create database: %w", err)
	}
	return errors.Is(statErr, os.ErrNotExist), nil
}

func (s *Store) ListDatabases() ([]string, error) {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		return nil, fmt.Errorf("list databases: %w", err)
	}

	databases := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if err := ValidateDatabaseName(name); err != nil {
			continue
		}
		databases = append(databases, name)
	}
	sort.Strings(databases)
	return databases, nil
}

func (s *Store) DeleteDatabase(name string) error {
	if err := ValidateDatabaseName(name); err != nil {
		return err
	}

	path := filepath.Join(s.root, name)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect database: %w", err)
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("delete database: %w", err)
	}
	s.cache.DeletePrefix(name + "/")
	return nil
}

func (s *Store) CreateCollection(database, collection string) (bool, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return false, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return false, err
	}

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

	dbPath := filepath.Join(s.root, database)
	if err := os.MkdirAll(dbPath, 0o700); err != nil {
		return false, fmt.Errorf("create database: %w", err)
	}

	path := filepath.Join(s.root, database, collection)
	_, statErr := os.Stat(path)
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return false, fmt.Errorf("inspect collection: %w", statErr)
	}
	if err := os.MkdirAll(path, 0o700); err != nil {
		return false, fmt.Errorf("create collection: %w", err)
	}
	return errors.Is(statErr, os.ErrNotExist), nil
}

func (s *Store) ListCollections(database string) ([]string, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(s.root, database)
	entries, err := os.ReadDir(dbPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("list collections: %w", err)
	}

	collections := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if err := ValidateCollectionName(name); err != nil {
			continue
		}
		collections = append(collections, name)
	}
	sort.Strings(collections)
	return collections, nil
}

func (s *Store) DeleteCollection(database, collection string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

	path := filepath.Join(s.root, database, collection)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect collection: %w", err)
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("delete collection: %w", err)
	}
	s.cache.DeletePrefix(cachePrefix(database, collection))
	return nil
}

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
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			break
		}
		if err != nil {
			return Document{}, fmt.Errorf("inspect document: %w", err)
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

func normalizeJSON(body []byte) ([]byte, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, ErrEmptyDocument
	}
	if !json.Valid(body) {
		return nil, ErrInvalidJSON
	}

	var compacted bytes.Buffer
	if err := json.Compact(&compacted, body); err != nil {
		return nil, ErrInvalidJSON
	}
	return compacted.Bytes(), nil
}

func generateID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("generate document id: %w", err)
	}
	return hex.EncodeToString(buf[:]), nil
}

func cachePrefix(database, collection string) string {
	return database + "/" + collection + "/"
}

func cacheKey(database, collection, id string) string {
	return database + "/" + collection + "/" + id
}

func (s *Store) cleanupOrphanedTempFiles() {
	_ = filepath.Walk(s.root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.HasPrefix(info.Name(), ".") && strings.Contains(info.Name(), ".tmp-") {
			_ = os.Remove(path)
		}
		return nil
	})
}
