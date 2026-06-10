package store

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPresenceHeartbeatAndLeave(t *testing.T) {
	db, err := NewWithOptions(t.TempDir(), 10, nil, Options{})
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	database := "testdb"
	collection := "users"
	clientID := "user123"
	metadata := json.RawMessage(`{"name": "Alice"}`)

	// 1. Initial Heartbeat should be new
	isNew, err := db.Heartbeat(database, collection, clientID, metadata, 5*time.Second)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if !isNew {
		t.Fatalf("expected first heartbeat to be new")
	}

	// 2. Second heartbeat should not be new
	isNew, err = db.Heartbeat(database, collection, clientID, metadata, 5*time.Second)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if isNew {
		t.Fatalf("expected second heartbeat to NOT be new")
	}

	// 3. List presence
	entries := db.ListPresence(database, collection)
	if len(entries) != 1 {
		t.Fatalf("expected 1 presence entry, got %d", len(entries))
	}
	if entries[0].ClientID != clientID {
		t.Errorf("expected client_id %s, got %s", clientID, entries[0].ClientID)
	}

	// 4. Leave presence
	found := db.LeavePresence(database, collection, clientID)
	if !found {
		t.Fatalf("expected to find presence entry to leave")
	}

	// 5. List presence again should be empty
	entries = db.ListPresence(database, collection)
	if len(entries) != 0 {
		t.Fatalf("expected 0 presence entries after leave, got %d", len(entries))
	}
}
