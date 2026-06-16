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

	result, err := db.Heartbeat(database, collection, clientID, metadata, 5*time.Second)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if !result.Joined {
		t.Fatalf("expected first heartbeat to be new")
	}
	if result.Updated {
		t.Fatalf("expected first heartbeat to not be an update")
	}

	result, err = db.Heartbeat(database, collection, clientID, metadata, 5*time.Second)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if result.Joined {
		t.Fatalf("expected second heartbeat to NOT be new")
	}
	if result.Updated {
		t.Fatalf("expected unchanged metadata heartbeat to not be an update")
	}

	updatedMetadata := json.RawMessage(`{"name": "Alice", "status": "editing"}`)
	result, err = db.Heartbeat(database, collection, clientID, updatedMetadata, 5*time.Second)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if result.Joined {
		t.Fatalf("expected metadata change heartbeat to not be new")
	}
	if !result.Updated {
		t.Fatalf("expected metadata change heartbeat to be an update")
	}

	entries := db.ListPresence(database, collection)
	if len(entries) != 1 {
		t.Fatalf("expected 1 presence entry, got %d", len(entries))
	}
	if entries[0].ClientID != clientID {
		t.Errorf("expected client_id %s, got %s", clientID, entries[0].ClientID)
	}
	if string(entries[0].Metadata) != string(updatedMetadata) {
		t.Errorf("expected metadata %s, got %s", updatedMetadata, entries[0].Metadata)
	}

	left, found := db.LeavePresence(database, collection, clientID)
	if !found {
		t.Fatalf("expected to find presence entry to leave")
	}
	if left.ClientID != clientID {
		t.Fatalf("left client_id = %s, want %s", left.ClientID, clientID)
	}

	entries = db.ListPresence(database, collection)
	if len(entries) != 0 {
		t.Fatalf("expected 0 presence entries after leave, got %d", len(entries))
	}
}

func TestPresenceListIsSortedByClientID(t *testing.T) {
	db, err := NewWithOptions(t.TempDir(), 10, nil, Options{})
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	for _, clientID := range []string{"client_b", "client_a"} {
		if _, err := db.Heartbeat("testdb", "users", clientID, nil, 5*time.Second); err != nil {
			t.Fatalf("heartbeat %s: %v", clientID, err)
		}
	}

	entries := db.ListPresence("testdb", "users")
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(entries))
	}
	if entries[0].ClientID != "client_a" || entries[1].ClientID != "client_b" {
		t.Fatalf("entries not sorted by client_id: %s, %s", entries[0].ClientID, entries[1].ClientID)
	}
}
