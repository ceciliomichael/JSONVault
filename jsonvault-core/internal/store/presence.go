package store

import (
	"bytes"
	"context"
	stdjson "encoding/json"
	"sort"
	"time"
)

func NewPresenceEvent(action, database, collection string, entry PresenceEntry) Event {
	document, _ := stdjson.Marshal(presenceEventDocument(entry))
	return Event{
		Action:     action,
		Database:   database,
		Collection: collection,
		DocumentID: entry.ClientID,
		Document:   document,
	}
}

func presenceEventDocument(entry PresenceEntry) map[string]any {
	document := map[string]any{
		"client_id":  entry.ClientID,
		"joined_at":  entry.JoinedAt,
		"expires_at": entry.ExpiresAt,
	}
	if len(entry.Metadata) > 0 {
		document["metadata"] = entry.Metadata
	}
	return document
}

func (s *Store) Heartbeat(database, collection, clientID string, metadata stdjson.RawMessage, ttl time.Duration) (PresenceHeartbeatResult, error) {
	if clientID == "" {
		return PresenceHeartbeatResult{}, nil // Ignore empty client IDs (handled as anonymous SSE connections)
	}

	s.presenceMu.Lock()
	defer s.presenceMu.Unlock()

	if s.presenceEntries == nil {
		s.presenceEntries = make(map[string]map[string]map[string]*PresenceEntry)
	}

	dbKey := database
	if s.presenceEntries[dbKey] == nil {
		s.presenceEntries[dbKey] = make(map[string]map[string]*PresenceEntry)
	}

	collKey := collection
	if s.presenceEntries[dbKey][collKey] == nil {
		s.presenceEntries[dbKey][collKey] = make(map[string]*PresenceEntry)
	}

	now := time.Now()
	expiresAt := now.Add(ttl)

	entry, exists := s.presenceEntries[dbKey][collKey][clientID]
	if exists {
		entry.ExpiresAt = expiresAt
		updated := false
		if len(metadata) > 0 {
			updated = !bytes.Equal(entry.Metadata, metadata)
			entry.Metadata = cloneRawMessage(metadata)
		}
		return PresenceHeartbeatResult{
			Updated: updated,
			Entry:   clonePresenceEntry(*entry),
		}, nil // Not a new join
	}

	entry = &PresenceEntry{
		ClientID:  clientID,
		Metadata:  cloneRawMessage(metadata),
		JoinedAt:  now,
		ExpiresAt: expiresAt,
	}
	s.presenceEntries[dbKey][collKey][clientID] = entry

	return PresenceHeartbeatResult{
		Joined: true,
		Entry:  clonePresenceEntry(*entry),
	}, nil // It's a new join!
}

func (s *Store) LeavePresence(database, collection, clientID string) (PresenceEntry, bool) {
	s.presenceMu.Lock()
	defer s.presenceMu.Unlock()

	if s.presenceEntries == nil {
		return PresenceEntry{}, false
	}
	colls, ok := s.presenceEntries[database]
	if !ok {
		return PresenceEntry{}, false
	}
	entries, ok := colls[collection]
	if !ok {
		return PresenceEntry{}, false
	}

	entry, exists := entries[clientID]
	if exists {
		left := clonePresenceEntry(*entry)
		delete(entries, clientID)
		if len(entries) == 0 {
			delete(colls, collection)
		}
		if len(colls) == 0 {
			delete(s.presenceEntries, database)
		}
		return left, true
	}
	return PresenceEntry{}, false
}

func (s *Store) ListPresence(database, collection string) []PresenceEntry {
	s.presenceMu.RLock()
	defer s.presenceMu.RUnlock()

	if s.presenceEntries == nil {
		return nil
	}
	colls, ok := s.presenceEntries[database]
	if !ok {
		return nil
	}
	entries, ok := colls[collection]
	if !ok {
		return nil
	}

	now := time.Now()
	var result []PresenceEntry
	for _, entry := range entries {
		if entry.ExpiresAt.After(now) {
			result = append(result, clonePresenceEntry(*entry))
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ClientID < result[j].ClientID
	})
	return result
}

// StartPresenceEvictionWorker runs periodically to remove expired presence entries
// and invokes the onEvict callback for each removed entry so the caller can broadcast.
func (s *Store) StartPresenceEvictionWorker(ctx context.Context, onEvict func(db, collection string, entry PresenceEntry)) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.evictExpiredPresence(onEvict)
		}
	}
}

func (s *Store) evictExpiredPresence(onEvict func(db, collection string, entry PresenceEntry)) {
	s.presenceMu.Lock()
	if s.presenceEntries == nil {
		s.presenceMu.Unlock()
		return
	}

	now := time.Now()
	type evictKey struct {
		db    string
		coll  string
		entry PresenceEntry
	}
	var toEvict []evictKey

	for dbName, colls := range s.presenceEntries {
		for collName, entries := range colls {
			for _, entry := range entries {
				if now.After(entry.ExpiresAt) {
					toEvict = append(toEvict, evictKey{dbName, collName, clonePresenceEntry(*entry)})
				}
			}
		}
	}

	// Remove from map while locked
	for _, k := range toEvict {
		delete(s.presenceEntries[k.db][k.coll], k.entry.ClientID)
		if len(s.presenceEntries[k.db][k.coll]) == 0 {
			delete(s.presenceEntries[k.db], k.coll)
		}
		if len(s.presenceEntries[k.db]) == 0 {
			delete(s.presenceEntries, k.db)
		}
	}
	s.presenceMu.Unlock()

	// Notify caller outside the lock
	for _, k := range toEvict {
		if onEvict != nil {
			onEvict(k.db, k.coll, k.entry)
		}
	}
}

func clonePresenceEntry(entry PresenceEntry) PresenceEntry {
	entry.Metadata = cloneRawMessage(entry.Metadata)
	return entry
}

func cloneRawMessage(value stdjson.RawMessage) stdjson.RawMessage {
	if len(value) == 0 {
		return nil
	}
	cloned := make([]byte, len(value))
	copy(cloned, value)
	return cloned
}
