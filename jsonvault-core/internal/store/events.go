package store

import "encoding/json"

// Event represents a database mutation to be broadcast to subscribers.
type Event struct {
	Action     string             `json:"action"` // "insert", "update", "delete"
	Database   string             `json:"database"`
	Collection string             `json:"collection"`
	DocumentID string             `json:"document_id"`
	ETag       string             `json:"etag,omitempty"`     // The new ETag
	Document   json.RawMessage    `json:"document,omitempty"` // Included for inserts/updates
}

// Subscription represents an active client listening to a specific collection.
type Subscription struct {
	Database   string
	Collection string
	Ch         chan Event
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
		}
	}
}

// GetSubscriberCount returns the number of active subscribers for a collection.
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
	// Asynchronously fire webhooks
	go s.TriggerWebhooks(event)

	s.subMu.RLock()
	defer s.subMu.RUnlock()

	if s.subscribers == nil {
		return
	}

	colls, ok := s.subscribers[event.Database]
	if !ok {
		return
	}

	subs, ok := colls[event.Collection]
	if !ok {
		return
	}

	for sub := range subs {
		select {
		case sub.Ch <- event:
			// Event sent successfully
		default:
			// The channel buffer is full because the client is too slow.
			// We intentionally drop the event rather than blocking the database engine.
			// The client will eventually disconnect and have to resync.
		}
	}
}
