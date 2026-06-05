package store

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	stdjson "encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	
	"github.com/bytedance/sonic"
)

type Store struct {
	root  string
	cache *LRUCache
	locks *LockManager
}

type Document struct {
	ID       string          `json:"id"`
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
		root:  absRoot,
		cache: NewLRUCache(cacheEntries),
		locks: NewLockManager(),
	}
	s.cleanupOrphanedTempFiles()
	return s, nil
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
