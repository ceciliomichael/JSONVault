package store

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	stdjson "encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

type Store struct {
	root          string
	cacheEntries  int
	encryptionKey []byte
	mu            sync.RWMutex
	dbs           map[string]*DBHandle

	subMu       sync.RWMutex
	subscribers map[string]map[string]map[*Subscription]struct{}
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

var etagRegex = regexp.MustCompile(`(?i)[a-f0-9]{64}`)

// matchETags safely compares two ETags by extracting the underlying 64-character SHA-256 hash.
// This guarantees that any proxy mutations (like Cloudflare's W/, or missing quotes) are completely ignored.
func matchETags(computed, expected string) bool {
	computedHash := strings.ToLower(etagRegex.FindString(computed))
	expectedHash := strings.ToLower(etagRegex.FindString(expected))
	
	if computedHash == "" || expectedHash == "" {
		return false // Reject if there isn't a valid 64-character hash
	}
	
	return computedHash == expectedHash
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
		root:          absRoot,
		cacheEntries:  cacheEntries,
		encryptionKey: encryptionKey,
		dbs:           make(map[string]*DBHandle),
	}
	return s, nil
}


func (s *Store) StartTTLWorker(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.purgeExpiredDocuments()
		}
	}
}

func (s *Store) purgeExpiredDocuments() {
	s.mu.RLock()
	dbNames := make(map[string]*DBHandle)
	for name, h := range s.dbs {
		dbNames[name] = h
	}
	s.mu.RUnlock()

	nowUnix := uint64(time.Now().Unix())

	for dbName, h := range dbNames {
		h.gate.RLock()
		db := h.db
		h.gate.RUnlock()

		if db == nil {
			continue
		}

		_ = db.Update(func(tx *bolt.Tx) error {
			ttlBucket := tx.Bucket([]byte("__ttl_index__"))
			if ttlBucket == nil {
				return nil
			}

			c := ttlBucket.Cursor()
			for k, _ := c.First(); k != nil; k, _ = c.Next() {
				if len(k) < 10 {
					continue
				}
				expireAt := binary.BigEndian.Uint64(k[0:8])
				if expireAt > nowUnix {
					break // Keys are chronologically sorted! We can stop immediately.
				}

				rest := k[8:]
				idx := bytes.IndexByte(rest, 0)
				if idx == -1 {
					continue
				}
				collection := string(rest[:idx])
				id := string(rest[idx+1:])

				b := tx.Bucket([]byte(collection))
				if b != nil {
					_ = b.Delete([]byte(id))
					_ = incrementCollectionCountTx(tx, collection, -1, b)
					
					s.PublishEvent(Event{
						Action:     "delete",
						Database:   dbName,
						Collection: collection,
						DocumentID: id,
					})
				}
				_ = c.Delete()
			}
			return nil
		})
	}
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var errs []string
	for name, h := range s.dbs {
		h.gate.Lock()
		if h.db != nil {
			if err := h.db.Close(); err != nil {
				errs = append(errs, fmt.Sprintf("close %s: %v", name, err))
			}
		}
		h.gate.Unlock()
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

	// LRU eviction. Close synchronously so immediate reopen attempts do not race
	// the old bbolt file lock.
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
			oldHandle.mu.Lock()
			oldHandle.state = stateDeleting
			oldHandle.mu.Unlock()
			oldHandle.gate.Lock()
			if oldHandle.db != nil {
				if err := oldHandle.db.Close(); err != nil {
					oldHandle.gate.Unlock()
					return nil, fmt.Errorf("evict database %s: %w", oldest, err)
				}
			}
			oldHandle.gate.Unlock()
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

func (s *Store) BackupDatabase(ctx context.Context, database string, w io.Writer) error {
	ctx = contextOrBackground(ctx)
	if err := ctx.Err(); err != nil {
		return err
	}
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
		if err := ctx.Err(); err != nil {
			return err
		}
		_, err := tx.WriteTo(contextWriter{ctx: ctx, w: w})
		return err
	})
}
