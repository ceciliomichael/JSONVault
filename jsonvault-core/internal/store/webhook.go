package store

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
)

var webhookBucket = []byte("_webhooks")

const webhookDeliveryAttempts = 3
const maxWebhooksPerCollection = 20

type WebhookConfig struct {
	URL    string   `json:"url"`
	Events []string `json:"events"` // "insert", "update", "delete", "*"
}

type WebhookRecord struct {
	Secret   string          `json:"secret"`
	Webhooks []WebhookConfig `json:"webhooks"`
}

type webhookTargetLimiter struct {
	mu       sync.Mutex
	capacity int
	maxKeys  int
	limits   map[string]*webhookTargetLimit
}

type webhookTargetLimit struct {
	ch       chan struct{}
	lastUsed time.Time
}

func newWebhookTargetLimiter(capacity int) *webhookTargetLimiter {
	if capacity < 1 {
		capacity = 1
	}
	return &webhookTargetLimiter{
		capacity: capacity,
		maxKeys:  1024,
		limits:   make(map[string]*webhookTargetLimit),
	}
}

func (l *webhookTargetLimiter) acquire(rawURL string) (func(), bool) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return nil, false
	}
	key := u.Scheme + "://" + u.Host

	l.mu.Lock()
	limit := l.limits[key]
	if limit == nil {
		l.pruneIdleLocked()
		if l.maxKeys > 0 && len(l.limits) >= l.maxKeys {
			l.mu.Unlock()
			return nil, false
		}
		limit = &webhookTargetLimit{ch: make(chan struct{}, l.capacity)}
		l.limits[key] = limit
	}
	limit.lastUsed = time.Now()
	l.mu.Unlock()

	select {
	case limit.ch <- struct{}{}:
		return func() { <-limit.ch }, true
	default:
		return nil, false
	}
}

func (l *webhookTargetLimiter) pruneIdleLocked() {
	for key, limit := range l.limits {
		if len(limit.ch) == 0 && time.Since(limit.lastUsed) > time.Minute {
			delete(l.limits, key)
		}
	}
}

// GenerateWebhookSecret creates a secure random hex string.
func GenerateWebhookSecret() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (s *Store) SetWebhooks(database, collection string, webhooks []WebhookConfig) (string, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return "", err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return "", err
	}

	db, err := s.getDB(database)
	if err != nil {
		return "", err
	}
	if err := validateWebhookConfigs(webhooks); err != nil {
		return "", err
	}

	var secret string

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	err = db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists(webhookBucket)
		if err != nil {
			return err
		}

		key := []byte(collection)

		// Preserve existing secret if one exists
		var record WebhookRecord
		existing := b.Get(key)
		if existing != nil {
			json.Unmarshal(existing, &record)
		} else {
			secret, err := GenerateWebhookSecret()
			if err != nil {
				return err
			}
			record.Secret = secret
		}

		record.Webhooks = webhooks
		secret = record.Secret

		data, err := json.Marshal(record)
		if err != nil {
			return err
		}

		return b.Put(key, data)
	})

	return secret, err
}

func validateWebhookConfigs(webhooks []WebhookConfig) error {
	if len(webhooks) > maxWebhooksPerCollection {
		return fmt.Errorf("%w: too many webhooks configured", ErrInvalidName)
	}

	seen := make(map[string]struct{})
	for _, hook := range webhooks {
		if len(hook.URL) == 0 || len(hook.URL) > 2048 {
			return fmt.Errorf("%w: webhook url is missing or too long", ErrInvalidName)
		}
		if !isSafeURL(hook.URL) {
			return fmt.Errorf("%w: webhook url is unsafe or invalid", ErrInvalidName)
		}
		if len(hook.Events) == 0 {
			return fmt.Errorf("%w: webhook events cannot be empty", ErrInvalidName)
		}
		for _, event := range hook.Events {
			if event != "*" && event != "insert" && event != "update" && event != "delete" && event != "publish" {
				return fmt.Errorf("%w: unsupported webhook event %q", ErrInvalidName, event)
			}
			key := hook.URL + "\x00" + event
			if _, ok := seen[key]; ok {
				return fmt.Errorf("%w: duplicate webhook target/event", ErrInvalidName)
			}
			seen[key] = struct{}{}
		}
	}
	return nil
}

func (s *Store) GetWebhooks(database, collection string) (*WebhookRecord, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, err
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	var record WebhookRecord

	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(webhookBucket)
		if b == nil {
			return nil
		}

		data := b.Get([]byte(collection))
		if data != nil {
			json.Unmarshal(data, &record)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	if record.Secret == "" {
		return nil, nil // No webhooks
	}

	return &record, nil
}

func deleteWebhooksTx(tx *bolt.Tx, collection string) error {
	b := tx.Bucket(webhookBucket)
	if b == nil {
		return nil
	}
	return b.Delete([]byte(collection))
}

// TriggerWebhooks asynchronously fires webhooks for a given event.
func (s *Store) TriggerWebhooks(event Event) {
	if err := s.deliverEventWebhooks(event); err != nil {
		slog.Warn("webhook delivery failed", "database", event.Database, "collection", event.Collection, "sequence", event.Sequence, "error", err)
	}
}

func (s *Store) deliverEventWebhooks(event Event) error {
	record, err := s.GetWebhooks(event.Database, event.Collection)
	if err != nil || record == nil || len(record.Webhooks) == 0 {
		return err
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// Compute HMAC signature
	mac := hmac.New(sha256.New, []byte(record.Secret))
	mac.Write(payload)
	signature := hex.EncodeToString(mac.Sum(nil))
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	eventID := strconv.FormatUint(event.Sequence, 10)
	v2Payload := append([]byte(timestamp+"."+eventID+"."), payload...)
	v2Mac := hmac.New(sha256.New, []byte(record.Secret))
	v2Mac.Write(v2Payload)
	v2Signature := hex.EncodeToString(v2Mac.Sum(nil))

	var errs []string
	for _, hook := range record.Webhooks {
		// Filter by event type
		matches := false
		for _, e := range hook.Events {
			if e == "*" || e == event.Action {
				matches = true
				break
			}
		}
		if !matches {
			continue
		}

		release, ok := s.webhookLimiter.acquire(hook.URL)
		if !ok {
			errs = append(errs, fmt.Sprintf("%s: target concurrency limit reached", hook.URL))
			continue
		}

		client, ok := safeWebhookHTTPClient(hook.URL)
		if !ok {
			release()
			errs = append(errs, fmt.Sprintf("%s: unsafe target", hook.URL))
			continue
		}

		if err := deliverWebhook(client, hook.URL, payload, signature, timestamp, eventID, v2Signature); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", hook.URL, err))
		}
		release()
	}
	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

func deliverWebhook(client *http.Client, target string, payload []byte, signature, timestamp, eventID, v2Signature string) error {
	var lastErr error
	for attempt := 1; attempt <= webhookDeliveryAttempts; attempt++ {
		req, err := http.NewRequest("POST", target, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-JSONVault-Signature", "sha256="+signature)
		req.Header.Set("X-JSONVault-Timestamp", timestamp)
		req.Header.Set("X-JSONVault-Event-ID", eventID)
		req.Header.Set("X-JSONVault-Signature-V2", "sha256="+v2Signature)

		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
				return nil
			}
			err = fmt.Errorf("non-success status %d", resp.StatusCode)
		}
		lastErr = err
		slog.Warn("webhook delivery attempt failed", "url", target, "attempt", attempt, "error", err)
		if attempt < webhookDeliveryAttempts {
			time.Sleep(time.Duration(attempt) * 50 * time.Millisecond)
		}
	}
	return lastErr
}

func (s *Store) processWebhookOutboxAllDatabases() {
	databases, err := s.ListDatabases()
	if err != nil {
		slog.Warn("list databases for webhook outbox", "error", err)
		return
	}
	for _, database := range databases {
		s.processWebhookOutboxForDatabase(database)
	}
}

func (s *Store) processWebhookOutboxForDatabase(database string) {
	db, err := s.getDB(database)
	if err != nil {
		return
	}
	for i := 0; i < 100; i++ {
		delivery, ok, err := claimWebhookDelivery(db)
		if err != nil {
			slog.Warn("claim webhook delivery", "database", database, "error", err)
			return
		}
		if !ok {
			return
		}
		if err := s.deliverEventWebhooks(delivery.Event); err != nil {
			if markErr := failWebhookDelivery(db, delivery.Sequence, err); markErr != nil {
				slog.Warn("mark webhook delivery failed", "database", database, "sequence", delivery.Sequence, "error", markErr)
			}
			continue
		}
		if err := deleteWebhookDelivery(db, delivery.Sequence); err != nil {
			slog.Warn("mark webhook delivery delivered", "database", database, "sequence", delivery.Sequence, "error", err)
		}
	}
}

func claimWebhookDelivery(db *DBHandle) (WebhookDelivery, bool, error) {
	var claimed WebhookDelivery
	now := time.Now().Unix()
	err := db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(webhookOutboxBucket)
		if b == nil {
			return nil
		}
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var delivery WebhookDelivery
			if err := json.Unmarshal(v, &delivery); err != nil {
				continue
			}
			if delivery.Status == webhookStatusPending && delivery.NextAttemptAt > now {
				continue
			}
			if delivery.Status == webhookStatusDelivering && now-delivery.UpdatedAt < 60 {
				continue
			}
			if delivery.Status == webhookStatusFailed {
				continue
			}
			delivery.Status = webhookStatusDelivering
			delivery.UpdatedAt = now
			encoded, err := json.Marshal(delivery)
			if err != nil {
				return err
			}
			if err := b.Put(k, encoded); err != nil {
				return err
			}
			claimed = delivery
			return nil
		}
		return nil
	})
	if err != nil {
		return WebhookDelivery{}, false, err
	}
	return claimed, claimed.Sequence != 0, nil
}

func failWebhookDelivery(db *DBHandle, sequence uint64, deliveryErr error) error {
	now := time.Now().Unix()
	return db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(webhookOutboxBucket)
		if b == nil {
			return ErrNotFound
		}
		key := uint64Key(sequence)
		data := b.Get(key)
		if data == nil {
			return ErrNotFound
		}
		var delivery WebhookDelivery
		if err := json.Unmarshal(data, &delivery); err != nil {
			return err
		}
		delivery.Attempts++
		delivery.LastError = deliveryErr.Error()
		delivery.UpdatedAt = now
		if delivery.Attempts >= webhookDeliveryAttempts {
			delivery.Status = webhookStatusFailed
			delivery.NextAttemptAt = 0
		} else {
			delivery.Status = webhookStatusPending
			delivery.NextAttemptAt = now + int64(delivery.Attempts*delivery.Attempts)
		}
		encoded, err := json.Marshal(delivery)
		if err != nil {
			return err
		}
		return b.Put(key, encoded)
	})
}

func deleteWebhookDelivery(db *DBHandle, sequence uint64) error {
	return db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(webhookOutboxBucket)
		if b == nil {
			return nil
		}
		return b.Delete(uint64Key(sequence))
	})
}

// SSRF Protection: Ensure URL does not point to internal/private IPs.
func isSafeURL(target string) bool {
	if os.Getenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS") == "true" {
		return true
	}
	_, ok := safeWebhookTarget(target)
	return ok
}

func safeWebhookHTTPClient(target string) (*http.Client, bool) {
	// Hidden flag used ONLY for our own internal automated httptest servers
	if os.Getenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS") == "true" {
		return &http.Client{
			Timeout:       3 * time.Second,
			CheckRedirect: noWebhookRedirects,
		}, true
	}

	safeTarget, ok := safeWebhookTarget(target)
	if !ok {
		return nil, false
	}

	dialer := &net.Dialer{Timeout: 3 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, safeTarget.dialAddress)
		},
	}
	return &http.Client{
		Timeout:       3 * time.Second,
		Transport:     transport,
		CheckRedirect: noWebhookRedirects,
	}, true
}

type safeWebhookResolvedTarget struct {
	dialAddress string
}

func safeWebhookTarget(target string) (safeWebhookResolvedTarget, bool) {
	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return safeWebhookResolvedTarget{}, false
	}

	hostname := u.Hostname()
	if hostname == "" {
		return safeWebhookResolvedTarget{}, false
	}
	ips, err := net.LookupIP(hostname)
	if err != nil || len(ips) == 0 {
		return safeWebhookResolvedTarget{}, false
	}

	for _, ip := range ips {
		if isUnsafeWebhookIP(ip) {
			return safeWebhookResolvedTarget{}, false
		}
	}

	port := u.Port()
	if port == "" {
		switch u.Scheme {
		case "http":
			port = "80"
		case "https":
			port = "443"
		default:
			return safeWebhookResolvedTarget{}, false
		}
	}

	return safeWebhookResolvedTarget{
		dialAddress: net.JoinHostPort(ips[0].String(), port),
	}, true
}

func isUnsafeWebhookIP(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified()
}

func noWebhookRedirects(_ *http.Request, _ []*http.Request) error {
	return fmt.Errorf("webhook redirects are disabled")
}
