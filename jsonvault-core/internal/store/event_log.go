package store

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"

	bolt "go.etcd.io/bbolt"
)

var (
	eventSequenceBucket = []byte("_events_seq")
	eventLogBucket      = []byte("_events_log")
	webhookOutboxBucket = []byte("_webhook_outbox")
)

const (
	eventSequenceKey        = "last"
	maxRetainedEvents       = 1000
	webhookStatusPending    = "pending"
	webhookStatusDelivering = "delivering"
	webhookStatusDelivered  = "delivered"
	webhookStatusFailed     = "failed"
)

type WebhookDelivery struct {
	Sequence      uint64 `json:"sequence"`
	Event         Event  `json:"event"`
	Status        string `json:"status"`
	Attempts      int    `json:"attempts"`
	NextAttemptAt int64  `json:"next_attempt_at,omitempty"`
	LastError     string `json:"last_error,omitempty"`
	UpdatedAt     int64  `json:"updated_at"`
}

func recordEventTx(tx *bolt.Tx, event Event) (Event, error) {
	seq, err := nextEventSequenceTx(tx)
	if err != nil {
		return Event{}, err
	}
	event.Sequence = seq

	encoded, err := json.Marshal(event)
	if err != nil {
		return Event{}, err
	}

	logBucket, err := tx.CreateBucketIfNotExists(eventLogBucket)
	if err != nil {
		return Event{}, err
	}
	if err := logBucket.Put(uint64Key(seq), encoded); err != nil {
		return Event{}, err
	}
	if err := trimEventLogTx(logBucket); err != nil {
		return Event{}, err
	}

	outboxBucket, err := tx.CreateBucketIfNotExists(webhookOutboxBucket)
	if err != nil {
		return Event{}, err
	}
	record := WebhookDelivery{
		Sequence:  seq,
		Event:     event,
		Status:    webhookStatusPending,
		UpdatedAt: time.Now().Unix(),
	}
	data, err := json.Marshal(record)
	if err != nil {
		return Event{}, err
	}
	if err := outboxBucket.Put(uint64Key(seq), data); err != nil {
		return Event{}, err
	}
	return event, nil
}

func nextEventSequenceTx(tx *bolt.Tx) (uint64, error) {
	b, err := tx.CreateBucketIfNotExists(eventSequenceBucket)
	if err != nil {
		return 0, err
	}
	var last uint64
	if data := b.Get([]byte(eventSequenceKey)); len(data) == 8 {
		last = binary.BigEndian.Uint64(data)
	}
	next := last + 1
	if err := b.Put([]byte(eventSequenceKey), uint64Key(next)); err != nil {
		return 0, err
	}
	return next, nil
}

func trimEventLogTx(b *bolt.Bucket) error {
	stats := b.Stats()
	for stats.KeyN > maxRetainedEvents {
		c := b.Cursor()
		k, _ := c.First()
		if k == nil {
			return nil
		}
		if err := c.Delete(); err != nil {
			return err
		}
		stats.KeyN--
	}
	return nil
}

func (s *Store) ReplayEvents(database, collection string, after uint64, limit int) ([]Event, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > maxRetainedEvents {
		limit = maxRetainedEvents
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	events := make([]Event, 0)
	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(eventLogBucket)
		if b == nil {
			return nil
		}
		c := b.Cursor()
		for k, v := c.Seek(uint64Key(after + 1)); k != nil && len(events) < limit; k, v = c.Next() {
			var event Event
			if err := json.Unmarshal(v, &event); err != nil {
				continue
			}
			if event.Collection == collection {
				events = append(events, event)
			}
		}
		return nil
	})
	return events, err
}

func (s *Store) ListWebhookDeliveries(database, status string, limit int) ([]WebhookDelivery, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}
	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	var deliveries []WebhookDelivery
	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(webhookOutboxBucket)
		if b == nil {
			return nil
		}
		c := b.Cursor()
		for k, v := c.First(); k != nil && len(deliveries) < limit; k, v = c.Next() {
			var delivery WebhookDelivery
			if err := json.Unmarshal(v, &delivery); err != nil {
				continue
			}
			if status == "" || delivery.Status == status {
				deliveries = append(deliveries, delivery)
			}
		}
		return nil
	})
	return deliveries, err
}

func (s *Store) RetryWebhookDelivery(database string, sequence uint64) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	db, err := s.getDB(database)
	if err != nil {
		return err
	}
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
			return fmt.Errorf("decode webhook delivery: %w", err)
		}
		delivery.Status = webhookStatusPending
		delivery.NextAttemptAt = 0
		delivery.LastError = ""
		delivery.UpdatedAt = time.Now().Unix()
		encoded, err := json.Marshal(delivery)
		if err != nil {
			return err
		}
		return b.Put(key, encoded)
	})
}

func uint64Key(v uint64) []byte {
	var key [8]byte
	binary.BigEndian.PutUint64(key[:], v)
	return key[:]
}
