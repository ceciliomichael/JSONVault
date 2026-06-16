package store

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	stdjson "encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

type Store struct {
	root               string
	cacheEntries       int
	encryptionKey      []byte
	encryptionRequired bool
	maxDocumentBytes   int
	maxResponseBytes   int
	maxQueryScanDocs   int
	maxQueryScanBytes  int64
	maxQueryDuration   time.Duration
	backupTempDir      string
	backupConcurrency  int
	backupFreeSpace    FreeSpaceChecker
	backupMu           sync.Mutex
	activeBackups      map[string]struct{}
	mu                 sync.RWMutex
	writeLocksMu       sync.Mutex
	writeLocks         map[string]*sync.Mutex
	dbs                map[string]*DBHandle
	schemaMu           sync.RWMutex
	schemaCache        map[string]cachedSchema
	statsMu            sync.Mutex
	statsCache         Stats
	statsCacheAt       time.Time
	statsCacheTTL      time.Duration

	subMu       sync.RWMutex
	subscribers map[string]map[string]map[*Subscription]struct{}
	eventSeq    atomic.Uint64

	webhookQueue    chan Event
	webhookLimiter  *webhookTargetLimiter
	webhookStop     chan struct{}
	webhookStopOnce sync.Once
	webhookWG       sync.WaitGroup

	presenceMu      sync.RWMutex
	presenceEntries map[string]map[string]map[string]*PresenceEntry
	presenceCancel  context.CancelFunc
	presenceWG      sync.WaitGroup
}

type Document struct {
	ID       string             `json:"id"`
	Document stdjson.RawMessage `json:"document"`
	ETag     string             `json:"etag"`
}

type TransactionOp struct {
	Action       string             `json:"action"` // "put", "patch", "delete"
	Collection   string             `json:"collection"`
	ID           string             `json:"id"`
	Body         stdjson.RawMessage `json:"body,omitempty"`
	ExpectedETag string             `json:"expected_etag,omitempty"`
}

type Options struct {
	EncryptionRequired bool
	MaxDocumentBytes   int
	MaxResponseBytes   int
	MaxQueryScanDocs   int
	MaxQueryScanBytes  int64
	MaxQueryDuration   time.Duration
	BackupTempDir      string
	BackupConcurrency  int
	BackupFreeSpace    FreeSpaceChecker
	StatsCacheTTL      time.Duration
}

type FreeSpaceChecker func(path string, requiredBytes int64) error

const (
	DefaultMaxDocumentBytes  = 10 * 1024 * 1024
	DefaultMaxResponseBytes  = 32 * 1024 * 1024
	DefaultMaxQueryScanDocs  = 50000
	DefaultMaxQueryScanBytes = 128 * 1024 * 1024
	DefaultBackupConcurrency = 1
	DefaultStatsCacheTTL     = 15 * time.Second
)

type Stats struct {
	OpenDatabases     int
	DataBytes         int64
	Subscribers       int
	WebhookQueueDepth int
}

func computeETag(data []byte) string {
	hash := sha256.Sum256(data)
	return fmt.Sprintf(`"%x"`, hash)
}

func matchETags(computed, expected string) bool {
	computedHash, ok := parseETagHash(computed)
	if !ok {
		return false
	}

	for _, token := range strings.Split(expected, ",") {
		token = strings.TrimSpace(token)
		if token == "*" {
			return true
		}
		expectedHash, ok := parseETagHash(token)
		if ok && computedHash == expectedHash {
			return true
		}
	}
	return false
}

func parseETagHash(value string) (string, bool) {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "W/")
	value = strings.TrimPrefix(value, "w/")
	if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
		value = value[1 : len(value)-1]
	}
	if len(value) != 64 {
		return "", false
	}
	for _, r := range value {
		isHex := (r >= '0' && r <= '9') ||
			(r >= 'a' && r <= 'f') ||
			(r >= 'A' && r <= 'F')
		if !isHex {
			return "", false
		}
	}
	return strings.ToLower(value), true
}

func New(root string, cacheEntries int, encryptionKey []byte) (*Store, error) {
	return NewWithOptions(root, cacheEntries, encryptionKey, Options{})
}

func NewWithOptions(root string, cacheEntries int, encryptionKey []byte, options Options) (*Store, error) {
	if strings.TrimSpace(root) == "" {
		return nil, fmt.Errorf("data directory cannot be empty")
	}
	if options.EncryptionRequired && len(encryptionKey) != 32 {
		return nil, fmt.Errorf("encryption is required but no valid 32-byte encryption key was provided")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve data directory: %w", err)
	}
	if err := os.MkdirAll(absRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	options = normalizeOptions(absRoot, options)
	presenceCtx, presenceCancel := context.WithCancel(context.Background())
	s := &Store{
		root:               absRoot,
		cacheEntries:       cacheEntries,
		encryptionKey:      encryptionKey,
		encryptionRequired: options.EncryptionRequired,
		maxDocumentBytes:   options.MaxDocumentBytes,
		maxResponseBytes:   options.MaxResponseBytes,
		maxQueryScanDocs:   options.MaxQueryScanDocs,
		maxQueryScanBytes:  options.MaxQueryScanBytes,
		maxQueryDuration:   options.MaxQueryDuration,
		backupTempDir:      options.BackupTempDir,
		backupConcurrency:  options.BackupConcurrency,
		backupFreeSpace:    options.BackupFreeSpace,
		statsCacheTTL:      options.StatsCacheTTL,
		activeBackups:      make(map[string]struct{}),
		writeLocks:         make(map[string]*sync.Mutex),
		dbs:                make(map[string]*DBHandle),
		schemaCache:        make(map[string]cachedSchema),
		webhookQueue:       make(chan Event, 1024),
		webhookLimiter:     newWebhookTargetLimiter(2),
		webhookStop:        make(chan struct{}),
		presenceCancel:     presenceCancel,
	}
	for i := 0; i < 4; i++ {
		s.webhookWG.Add(1)
		go s.webhookWorker()
	}

	s.presenceWG.Add(1)
	go func() {
		defer s.presenceWG.Done()
		s.StartPresenceEvictionWorker(presenceCtx, func(db, collection string, entry PresenceEntry) {
			s.PublishEvent(NewPresenceEvent("presence_leave", db, collection, entry))
		})
	}()

	return s, nil
}

func normalizeOptions(root string, options Options) Options {
	if options.MaxDocumentBytes < 1 {
		options.MaxDocumentBytes = DefaultMaxDocumentBytes
	}
	if options.MaxResponseBytes < 1 {
		options.MaxResponseBytes = DefaultMaxResponseBytes
	}
	if options.MaxQueryScanDocs < 1 {
		options.MaxQueryScanDocs = DefaultMaxQueryScanDocs
	}
	if options.MaxQueryScanBytes < 1 {
		options.MaxQueryScanBytes = DefaultMaxQueryScanBytes
	}
	if options.BackupTempDir == "" {
		options.BackupTempDir = filepath.Join(root, "_tmp", "backups")
	}
	if options.BackupConcurrency < 1 {
		options.BackupConcurrency = DefaultBackupConcurrency
	}
	if options.BackupFreeSpace == nil {
		options.BackupFreeSpace = checkFreeSpace
	}
	if options.StatsCacheTTL <= 0 {
		options.StatsCacheTTL = DefaultStatsCacheTTL
	}
	return options
}

func (s *Store) enforceDocumentSize(data []byte) error {
	if s.maxDocumentBytes > 0 && len(data) > s.maxDocumentBytes {
		return fmt.Errorf("%w: %d bytes > %d bytes", ErrDocumentTooLarge, len(data), s.maxDocumentBytes)
	}
	return nil
}

func (s *Store) lockDatabaseWrite(database string) func() {
	s.writeLocksMu.Lock()
	lock := s.writeLocks[database]
	if lock == nil {
		lock = &sync.Mutex{}
		s.writeLocks[database] = lock
	}
	s.writeLocksMu.Unlock()

	lock.Lock()
	return lock.Unlock
}

func (s *Store) StartTTLWorker(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.purgeExpiredDocuments(); err != nil {
				slog.Error("purge expired documents", "error", err)
			}
		}
	}
}

func (s *Store) purgeExpiredDocuments() error {
	dbNames, err := s.ListDatabases()
	if err != nil {
		return err
	}

	nowUnix := uint64(time.Now().Unix())
	var errs []string

	for _, dbName := range dbNames {
		h, err := s.getDB(dbName)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", dbName, err))
			continue
		}
		var events []Event

		unlock := s.lockDatabaseWrite(dbName)
		err = h.Update(func(tx *bolt.Tx) error {
			ttlBucket := tx.Bucket(ttlIndexBucketKey())
			if ttlBucket == nil {
				return nil
			}

			c := ttlBucket.Cursor()
			for k, _ := c.First(); k != nil; k, _ = c.Next() {
				expireAt, collection, id, ok := parseTTLIndexKey(k)
				if !ok {
					if err := c.Delete(); err != nil {
						return err
					}
					continue
				}
				if expireAt > nowUnix {
					break // Keys are chronologically sorted! We can stop immediately.
				}

				currentExpireAt, exists := getDocumentTTLTx(tx, collection, id)
				if !exists || currentExpireAt != expireAt {
					if err := c.Delete(); err != nil {
						return err
					}
					continue
				}

				b := tx.Bucket([]byte(collection))
				if b != nil {
					existingData := b.Get([]byte(id))
					if existingData != nil {
						existingPlaintext, err := decryptDocument(existingData, s.encryptionKey, s.encryptionRequired)
						if err != nil {
							return fmt.Errorf("corrupt ttl document %s/%s: %w", collection, id, err)
						}
						if err := unindexDocumentTx(tx, collection, id, existingPlaintext); err != nil {
							return fmt.Errorf("unindex ttl document %s/%s: %w", collection, id, err)
						}
						if err := incrementCollectionCountTx(tx, collection, -1, b); err != nil {
							return err
						}
						if err := b.Delete([]byte(id)); err != nil {
							return err
						}
						event, err := recordEventTx(tx, Event{
							Action:     "delete",
							Database:   dbName,
							Collection: collection,
							DocumentID: id,
						})
						if err != nil {
							return err
						}
						events = append(events, event)
					}
				}
				if err := deleteTTLDocEntryTx(tx, collection, id); err != nil {
					return err
				}
				if err := c.Delete(); err != nil {
					return err
				}
			}
			return nil
		})
		unlock()
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", dbName, err))
			continue
		}

		for _, event := range events {
			s.PublishEvent(event)
		}
	}

	if len(errs) > 0 {
		return errors.New(strings.Join(errs, ", "))
	}
	return nil
}

func (s *Store) Close() error {
	if s.presenceCancel != nil {
		s.presenceCancel()
		s.presenceWG.Wait()
	}

	s.webhookStopOnce.Do(func() {
		close(s.webhookStop)
	})
	s.webhookWG.Wait()

	s.mu.Lock()
	handles := s.dbs
	s.dbs = make(map[string]*DBHandle)
	s.mu.Unlock()

	var errs []string
	for name, h := range handles {
		h.mu.Lock()
		h.state = stateDeleting
		h.mu.Unlock()

		h.gate.Lock()
		if h.db != nil {
			if err := h.db.Close(); err != nil {
				errs = append(errs, fmt.Sprintf("close %s: %v", name, err))
			}
		}
		h.gate.Unlock()
	}
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
	if h, ok := s.dbs[database]; ok {
		h.mu.Lock()
		if h.state == stateDeleting {
			h.mu.Unlock()
			s.mu.Unlock()
			return nil, ErrNotFound
		}
		h.lastUsed = time.Now()
		h.mu.Unlock()
		s.mu.Unlock()
		return h, nil
	}

	var evictName string
	var evictHandle *DBHandle

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
			evictName = oldest
			evictHandle = s.dbs[oldest]
			delete(s.dbs, oldest)
			evictHandle.mu.Lock()
			evictHandle.state = stateDeleting
			evictHandle.mu.Unlock()
		}
	}
	s.mu.Unlock()

	if evictHandle != nil {
		evictHandle.gate.Lock()
		if evictHandle.db != nil {
			if err := evictHandle.db.Close(); err != nil {
				evictHandle.gate.Unlock()
				return nil, fmt.Errorf("evict database %s: %w", evictName, err)
			}
		}
		evictHandle.gate.Unlock()
	}

	for {
		s.mu.Lock()
		if h, ok := s.dbs[database]; ok {
			h.mu.Lock()
			if h.state == stateDeleting {
				h.mu.Unlock()
				s.mu.Unlock()
				return nil, ErrNotFound
			}
			h.lastUsed = time.Now()
			h.mu.Unlock()
			s.mu.Unlock()
			return h, nil
		}
		if s.cacheEntries <= 0 || len(s.dbs) < s.cacheEntries {
			break
		}

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
		if oldest == "" {
			break
		}
		evictName := oldest
		evictHandle := s.dbs[oldest]
		delete(s.dbs, oldest)
		evictHandle.mu.Lock()
		evictHandle.state = stateDeleting
		evictHandle.mu.Unlock()
		s.mu.Unlock()

		evictHandle.gate.Lock()
		if evictHandle.db != nil {
			if err := evictHandle.db.Close(); err != nil {
				evictHandle.gate.Unlock()
				return nil, fmt.Errorf("evict database %s: %w", evictName, err)
			}
		}
		evictHandle.gate.Unlock()
	}
	defer s.mu.Unlock()

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

func (s *Store) Stats() Stats {
	var stats Stats

	s.mu.RLock()
	stats.OpenDatabases = len(s.dbs)
	s.mu.RUnlock()

	s.subMu.RLock()
	for _, collections := range s.subscribers {
		for _, subscribers := range collections {
			stats.Subscribers += len(subscribers)
		}
	}
	s.subMu.RUnlock()

	if s.webhookQueue != nil {
		stats.WebhookQueueDepth = len(s.webhookQueue)
	}

	s.statsMu.Lock()
	if time.Since(s.statsCacheAt) < s.statsCacheTTL {
		stats.DataBytes = s.statsCache.DataBytes
		s.statsMu.Unlock()
		return stats
	}
	s.statsMu.Unlock()

	_ = filepath.WalkDir(s.root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".db") {
			return nil
		}
		info, err := d.Info()
		if err == nil {
			stats.DataBytes += info.Size()
		}
		return nil
	})

	s.statsMu.Lock()
	s.statsCache.DataBytes = stats.DataBytes
	s.statsCacheAt = time.Now()
	s.statsMu.Unlock()

	return stats
}

func (s *Store) BackupDatabase(ctx context.Context, database string, w io.Writer) error {
	ctx = contextOrBackground(ctx)
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}

	release, err := s.beginBackup(database)
	if err != nil {
		return err
	}
	defer release()

	path := filepath.Join(s.root, database+".db")
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(s.backupTempDir, 0o700); err != nil {
		return fmt.Errorf("create backup temp directory: %w", err)
	}
	if err := s.backupFreeSpace(s.backupTempDir, backupRequiredBytes(info.Size())); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(s.backupTempDir, "jsonvault-backup-*.db")
	if err != nil {
		return fmt.Errorf("create backup snapshot: %w", err)
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	if err := db.View(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		_, err := tx.WriteTo(tmp)
		return err
	}); err != nil {
		return err
	}

	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("rewind backup snapshot: %w", err)
	}
	_, err = io.Copy(contextWriter{ctx: ctx, w: w}, tmp)
	return err
}

func (s *Store) beginBackup(database string) (func(), error) {
	s.backupMu.Lock()
	defer s.backupMu.Unlock()
	if _, ok := s.activeBackups[database]; ok {
		return nil, fmt.Errorf("%w: %s", ErrBackupInProgress, database)
	}
	if s.backupConcurrency > 0 && len(s.activeBackups) >= s.backupConcurrency {
		return nil, fmt.Errorf("%w: maximum concurrent backups is %d", ErrBackupInProgress, s.backupConcurrency)
	}
	s.activeBackups[database] = struct{}{}
	return func() {
		s.backupMu.Lock()
		delete(s.activeBackups, database)
		s.backupMu.Unlock()
	}, nil
}

func backupRequiredBytes(databaseSize int64) int64 {
	const margin = 16 * 1024 * 1024
	if databaseSize < 0 {
		databaseSize = 0
	}
	return databaseSize + margin
}
