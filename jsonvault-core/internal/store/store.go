package store

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	stdjson "encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

type Store struct {
	root         string
	cacheEntries int
	encryptionKey []byte
	mu           sync.RWMutex
	dbs          map[string]*DBHandle
}

type Document struct {
	ID       string             `json:"id"`
	Document stdjson.RawMessage `json:"document"`
	ETag     string             `json:"-"`
}

func computeETag(data []byte) string {
	hash := sha256.Sum256(data)
	return fmt.Sprintf(`"%x"`, hash)
}

func New(root string, cacheEntries int, encryptionKey []byte) (*Store, error) {
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
		root:         absRoot,
		cacheEntries: cacheEntries,
		encryptionKey: encryptionKey,
		dbs:          make(map[string]*DBHandle),
	}
	return s, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var errs []string
	for name, h := range s.dbs {
		h.wg.Wait()
		if h.db != nil {
			if err := h.db.Close(); err != nil {
				errs = append(errs, fmt.Sprintf("close %s: %v", name, err))
			}
		}
	}
	s.dbs = make(map[string]*DBHandle)
	if len(errs) > 0 {
		return errors.New(strings.Join(errs, ", "))
	}
	return nil
}

func (s *Store) getDB(database string) (*DBHandle, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	s.mu.RLock()
	h, ok := s.dbs[database]
	s.mu.RUnlock()
	if ok {
		h.mu.Lock()
		defer h.mu.Unlock()
		if h.state == stateDeleting {
			return nil, ErrNotFound
		}
		h.lastUsed = time.Now()
		return h, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if h, ok := s.dbs[database]; ok {
		h.mu.Lock()
		defer h.mu.Unlock()
		if h.state == stateDeleting {
			return nil, ErrNotFound
		}
		h.lastUsed = time.Now()
		return h, nil
	}

	// LRU eviction
	if s.cacheEntries > 0 && len(s.dbs) >= s.cacheEntries {
		var oldest string
		var oldestTime time.Time
		for name, handle := range s.dbs {
			handle.mu.RLock()
			t := handle.lastUsed
			handle.mu.RUnlock()
			if oldest == "" || t.Before(oldestTime) {
				oldest = name
				oldestTime = t
			}
		}
		if oldest != "" {
			oldHandle := s.dbs[oldest]
			delete(s.dbs, oldest)
			go func() {
				oldHandle.mu.Lock()
				oldHandle.state = stateDeleting
				oldHandle.mu.Unlock()
				oldHandle.wg.Wait()
				if oldHandle.db != nil {
					oldHandle.db.Close()
				}
			}()
		}
	}

	path := filepath.Join(s.root, database+".db")

	options := bolt.DefaultOptions
	options.Timeout = 5 * time.Second

	db, err := bolt.Open(path, 0600, options)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	
	h = &DBHandle{
		db:       db,
		state:    stateActive,
		lastUsed: time.Now(),
	}
	s.dbs[database] = h
	return h, nil
}

func normalizeJSON(body []byte) ([]byte, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, ErrEmptyDocument
	}
	if !bytes.HasPrefix(body, []byte("{")) || !bytes.HasSuffix(body, []byte("}")) {
		return nil, ErrInvalidJSON
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

func (s *Store) BackupDatabase(database string, w io.Writer) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	return db.View(func(tx *bolt.Tx) error {
		_, err := tx.WriteTo(w)
		return err
	})
}
