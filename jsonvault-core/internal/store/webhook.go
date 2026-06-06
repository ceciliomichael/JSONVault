package store

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	bolt "go.etcd.io/bbolt"
)

var webhookBucket = []byte("_webhooks")

type WebhookConfig struct {
	URL    string   `json:"url"`
	Events []string `json:"events"` // "insert", "update", "delete", "*"
}

type WebhookRecord struct {
	Secret   string          `json:"secret"`
	Webhooks []WebhookConfig `json:"webhooks"`
}

// GenerateWebhookSecret creates a secure random hex string
func GenerateWebhookSecret() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
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

	var secret string

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
			record.Secret = GenerateWebhookSecret()
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

func (s *Store) GetWebhooks(database, collection string) (*WebhookRecord, error) {
	if err := ValidateDatabaseName(database); err != nil {
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

// TriggerWebhooks asynchronously fires webhooks for a given event.
func (s *Store) TriggerWebhooks(event Event) {
	record, err := s.GetWebhooks(event.Database, event.Collection)
	if err != nil || record == nil || len(record.Webhooks) == 0 {
		return
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return
	}

	// Compute HMAC signature
	mac := hmac.New(sha256.New, []byte(record.Secret))
	mac.Write(payload)
	signature := hex.EncodeToString(mac.Sum(nil))

	client := &http.Client{
		Timeout: 3 * time.Second, // Fast timeout so we don't hold resources
	}

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

		// SSRF Protection
		if !isSafeURL(hook.URL) {
			continue
		}

		// Fire asynchronously
		go func(targetURL string) {
			req, err := http.NewRequest("POST", targetURL, bytes.NewReader(payload))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-JSONVault-Signature", "sha256="+signature)

			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
			}
		}(hook.URL)
	}
}

// SSRF Protection: Ensure URL does not point to internal/private IPs.
func isSafeURL(target string) bool {
	// Hidden flag used ONLY for our own internal automated httptest servers
	if os.Getenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS") == "true" {
		return true
	}

	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}

	hostname := u.Hostname()
	ips, err := net.LookupIP(hostname)
	if err != nil {
		return false
	}

	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return false
		}
	}
	return true
}
