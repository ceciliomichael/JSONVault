package store

import (
	stdjson "encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// Event represents a database mutation to be broadcast to subscribers.
type Event struct {
	Sequence   uint64             `json:"sequence,omitempty"`
	Action     string             `json:"action"` // "insert", "update", "delete"
	Database   string             `json:"database"`
	Collection string             `json:"collection"`
	DocumentID string             `json:"document_id"`
	ETag       string             `json:"etag,omitempty"`     // The new ETag
	Document   stdjson.RawMessage `json:"document,omitempty"` // Included for inserts/updates
}

// PresenceEntry represents an active client tracking its online status.
type PresenceEntry struct {
	ClientID  string             `json:"client_id"`
	Metadata  stdjson.RawMessage `json:"metadata,omitempty"`
	JoinedAt  time.Time          `json:"joined_at"`
	ExpiresAt time.Time          `json:"expires_at"`
}

type PresenceHeartbeatResult struct {
	Joined  bool
	Updated bool
	Entry   PresenceEntry
}

type Subscription struct {
	Database   string
	Collection string
	Ch         chan Event
	closeOnce  sync.Once
}

func (sub *Subscription) close() {
	sub.closeOnce.Do(func() {
		close(sub.Ch)
	})
}

// Subscribe creates a new subscription for a database and collection.
func (s *Store) Subscribe(database, collection string) *Subscription {
	sub := &Subscription{
		Database:   database,
		Collection: collection,
		// Buffer 100 events to prevent a slow client from immediately dropping events
		Ch: make(chan Event, 100),
	}

	s.subMu.Lock()
	defer s.subMu.Unlock()

	if s.subscribers == nil {
		s.subscribers = make(map[string]map[string]map[*Subscription]struct{})
	}

	dbKey := database
	if s.subscribers[dbKey] == nil {
		s.subscribers[dbKey] = make(map[string]map[*Subscription]struct{})
	}

	collKey := collection
	if s.subscribers[dbKey][collKey] == nil {
		s.subscribers[dbKey][collKey] = make(map[*Subscription]struct{})
	}

	s.subscribers[dbKey][collKey][sub] = struct{}{}
	return sub
}

// Unsubscribe removes a subscription from the store.
func (s *Store) Unsubscribe(sub *Subscription) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	if s.subscribers == nil {
		return
	}

	if colls, ok := s.subscribers[sub.Database]; ok {
		if subs, ok := colls[sub.Collection]; ok {
			delete(subs, sub)
			if len(subs) == 0 {
				delete(colls, sub.Collection)
			}
		}
		if len(colls) == 0 {
			delete(s.subscribers, sub.Database)
		}
	}
}

// GetSubscriberCount returns the raw number of active SSE subscribers for a collection.
func (s *Store) GetSubscriberCount(database, collection string) int {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	if s.subscribers == nil {
		return 0
	}
	if colls, ok := s.subscribers[database]; ok {
		if subs, ok := colls[collection]; ok {
			return len(subs)
		}
	}
	return 0
}

// PublishEvent broadcasts an event to all active subscribers for that collection.
func (s *Store) PublishEvent(event Event) {
	if event.Sequence == 0 && shouldAssignEventSequence(event.Action) {
		event.Sequence = s.eventSeq.Add(1)
	}

	s.enqueueWebhook(event)

	s.subMu.RLock()
	if s.subscribers == nil {
		s.subMu.RUnlock()
		return
	}

	colls, ok := s.subscribers[event.Database]
	if !ok {
		s.subMu.RUnlock()
		return
	}

	subs, ok := colls[event.Collection]
	if !ok {
		s.subMu.RUnlock()
		return
	}

	var slow []*Subscription
	for sub := range subs {
		select {
		case sub.Ch <- event:
			// Event sent successfully.
		default:
			slow = append(slow, sub)
		}
	}
	s.subMu.RUnlock()

	for _, sub := range slow {
		s.Unsubscribe(sub)
		sub.close()
	}
}

func shouldAssignEventSequence(action string) bool {
	return action != "publish" && !isPresenceEventAction(action)
}

func isPresenceEventAction(action string) bool {
	return strings.HasPrefix(action, "presence_")
}

func (s *Store) enqueueWebhook(event Event) {
	if s.webhookQueue == nil {
		return
	}
	if isPresenceEventAction(event.Action) {
		return
	}
	select {
	case <-s.webhookStop:
		return
	default:
	}

	select {
	case s.webhookQueue <- event:
	case <-s.webhookStop:
		return
	default:
		if event.Sequence == 0 || event.Action == "publish" {
			slog.Warn("webhook queue full; dropping transient event",
				"database", event.Database,
				"collection", event.Collection,
				"document_id", event.DocumentID,
				"sequence", event.Sequence,
			)
			return
		}
		slog.Warn("webhook queue full; durable event will retry from outbox",
			"database", event.Database,
			"collection", event.Collection,
			"document_id", event.DocumentID,
			"sequence", event.Sequence,
		)
	}
}

func (s *Store) webhookWorker() {
	defer s.webhookWG.Done()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.webhookStop:
			return
		case event := <-s.webhookQueue:
			if event.Sequence == 0 || event.Action == "publish" {
				s.TriggerWebhooks(event)
				continue
			}
			s.processWebhookOutboxForDatabase(event.Database)
		case <-ticker.C:
			s.processWebhookOutboxAllDatabases()
		}
	}
}
