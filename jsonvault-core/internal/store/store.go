package store

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	stdjson "encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

type Store struct {
	root string
	mu   sync.RWMutex
	dbs  map[string]*bolt.DB
}

type Document struct {
	ID       string             `json:"id"`
	Document stdjson.RawMessage `json:"document"`
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
		root: absRoot,
		dbs:  make(map[string]*bolt.DB),
	}
	return s, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var errs []string
	for name, db := range s.dbs {
		if err := db.Close(); err != nil {
			errs = append(errs, fmt.Sprintf("close %s: %v", name, err))
		}
	}
	s.dbs = make(map[string]*bolt.DB)
	if len(errs) > 0 {
		return errors.New(strings.Join(errs, ", "))
	}
	return nil
}

func (s *Store) getDB(database string) (*bolt.DB, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	s.mu.RLock()
	db, ok := s.dbs[database]
	s.mu.RUnlock()
	if ok {
		return db, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if db, ok := s.dbs[database]; ok {
		return db, nil
	}

	path := filepath.Join(s.root, database+".db")

	options := bolt.DefaultOptions
	options.Timeout = 5 * time.Second

	db, err := bolt.Open(path, 0600, options)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	s.dbs[database] = db
	return db, nil
}

func normalizeJSON(body []byte) ([]byte, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, ErrEmptyDocument
	}
	if !sonic.ConfigDefault.Valid(body) {
		return nil, ErrInvalidJSON
	}

	var compacted bytes.Buffer
	if err := stdjson.Compact(&compacted, body); err != nil {
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
