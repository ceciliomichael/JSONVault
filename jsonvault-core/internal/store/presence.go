package store

import (
	"context"
	stdjson "encoding/json"
	"time"
)

func (s *Store) Heartbeat(database, collection, clientID string, metadata stdjson.RawMessage, ttl time.Duration) (bool, error) {
	if clientID == "" {
		return false, nil // Ignore empty client IDs (handled as anonymous SSE connections)
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
		if len(metadata) > 0 {
			entry.Metadata = metadata
		}
		return false, nil // Not a new join
	}

	s.presenceEntries[dbKey][collKey][clientID] = &PresenceEntry{
		ClientID:  clientID,
		Metadata:  metadata,
		JoinedAt:  now,
		ExpiresAt: expiresAt,
	}

	return true, nil // It's a new join!
}

func (s *Store) LeavePresence(database, collection, clientID string) bool {
	s.presenceMu.Lock()
	defer s.presenceMu.Unlock()

	if s.presenceEntries == nil {
		return false
	}
	colls, ok := s.presenceEntries[database]
	if !ok {
		return false
	}
	entries, ok := colls[collection]
	if !ok {
		return false
	}

	_, exists := entries[clientID]
	if exists {
		delete(entries, clientID)
		if len(entries) == 0 {
			delete(colls, collection)
		}
		if len(colls) == 0 {
			delete(s.presenceEntries, database)
		}
		return true
	}
	return false
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
			result = append(result, *entry)
		}
	}
	return result
}

// StartPresenceEvictionWorker runs periodically to remove expired presence entries
// and invokes the onEvict callback for each removed entry so the caller can broadcast.
func (s *Store) StartPresenceEvictionWorker(ctx context.Context, onEvict func(db, collection, clientID string)) {
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

func (s *Store) evictExpiredPresence(onEvict func(db, collection, clientID string)) {
	s.presenceMu.Lock()
	if s.presenceEntries == nil {
		s.presenceMu.Unlock()
		return
	}

	now := time.Now()
	type evictKey struct {
		db   string
		coll string
		id   string
	}
	var toEvict []evictKey

	for dbName, colls := range s.presenceEntries {
		for collName, entries := range colls {
			for clientID, entry := range entries {
				if now.After(entry.ExpiresAt) {
					toEvict = append(toEvict, evictKey{dbName, collName, clientID})
				}
			}
		}
	}

	// Remove from map while locked
	for _, k := range toEvict {
		delete(s.presenceEntries[k.db][k.coll], k.id)
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
			onEvict(k.db, k.coll, k.id)
		}
	}
}
