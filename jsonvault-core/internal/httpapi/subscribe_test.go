package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"jsonvault/internal/store"
)

func TestRealTimeSubscription(t *testing.T) {
	// 1. Setup a test database engine
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	// 2. Setup the server router
	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 3. Connect a client to the SSE Subscription endpoint
	req, _ := http.NewRequest("GET", server.URL+"/api/v1/testdb/testcol/subscribe", nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req = req.WithContext(ctx)

	client := &http.Client{
		Timeout: 0, // No timeout for SSE
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("failed to connect to SSE: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}
	if resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("expected text/event-stream, got %s", resp.Header.Get("Content-Type"))
	}

	// 4. In a background thread, trigger a database mutation (insert a document)
	go func() {
		// Give the subscription a few milliseconds to fully register
		time.Sleep(100 * time.Millisecond)

		payload := []byte(`{"test":"realtime"}`)
		postReq, _ := http.NewRequest("POST", server.URL+"/api/v1/testdb/testcol", bytes.NewReader(payload))
		postReq.Header.Set("Content-Type", "application/json")
		postResp, err := http.DefaultClient.Do(postReq)
		if err != nil || postResp.StatusCode != http.StatusCreated {
			t.Errorf("failed to trigger POST mutation")
		}
		postResp.Body.Close()
	}()

	// 5. Read the stream and verify the event arrives instantly
	reader := bufio.NewReader(resp.Body)

	snapshot := readSSEEvent(t, reader)
	if snapshot.Action != "presence_state" {
		t.Fatalf("expected initial presence_state, got %s", snapshot.Action)
	}

	event := readSSEEvent(t, reader)

	if event.Action != "insert" {
		t.Errorf("expected action 'insert', got '%s'", event.Action)
	}
	if event.Database != "testdb" {
		t.Errorf("expected database 'testdb', got '%s'", event.Database)
	}
	if event.Collection != "testcol" {
		t.Errorf("expected collection 'testcol', got '%s'", event.Collection)
	}

	var docData map[string]interface{}
	json.Unmarshal(event.Document, &docData)
	if docData["test"] != "realtime" {
		t.Errorf("expected document to contain 'test: realtime', got %v", docData)
	}
}

func TestSubscriptionEmitsPresenceStateAndUpdate(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	postHeartbeat := func(body string) {
		t.Helper()
		req, err := http.NewRequest(http.MethodPost, server.URL+"/api/v1/testdb/testcol/heartbeat", bytes.NewReader([]byte(body)))
		if err != nil {
			t.Fatalf("heartbeat request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("heartbeat: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("heartbeat status = %d, want %d", resp.StatusCode, http.StatusOK)
		}
	}

	postHeartbeat(`{"client_id":"client_1","metadata":{"name":"Alice"}}`)

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/v1/testdb/testcol/subscribe", nil)
	if err != nil {
		t.Fatalf("subscribe request: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := (&http.Client{Timeout: 0}).Do(req)
	if err != nil {
		t.Fatalf("failed to connect to SSE: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)
	snapshot := readSSEEvent(t, reader)
	if snapshot.Action != "presence_state" {
		t.Fatalf("expected initial presence_state, got %s", snapshot.Action)
	}
	if snapshot.Sequence != 0 {
		t.Fatalf("presence_state sequence = %d, want 0", snapshot.Sequence)
	}

	var stateBody struct {
		Count int                              `json:"count"`
		State map[string][]store.PresenceEntry `json:"state"`
	}
	if err := json.Unmarshal(snapshot.Document, &stateBody); err != nil {
		t.Fatalf("presence_state document: %v", err)
	}
	if stateBody.Count != 1 {
		t.Fatalf("presence_state count = %d, want 1", stateBody.Count)
	}
	if got := stateBody.State["client_1"]; len(got) != 1 || string(got[0].Metadata) != `{"name":"Alice"}` {
		t.Fatalf("presence_state client_1 = %#v", got)
	}

	postHeartbeat(`{"client_id":"client_1","metadata":{"name":"Alice","status":"editing"}}`)

	update := readSSEEvent(t, reader)
	if update.Action != "presence_update" {
		t.Fatalf("expected presence_update, got %s", update.Action)
	}
	if update.Sequence != 0 {
		t.Fatalf("presence_update sequence = %d, want 0", update.Sequence)
	}
	if update.DocumentID != "client_1" {
		t.Fatalf("presence_update document_id = %s, want client_1", update.DocumentID)
	}

	var updated store.PresenceEntry
	if err := json.Unmarshal(update.Document, &updated); err != nil {
		t.Fatalf("presence_update document: %v", err)
	}
	if string(updated.Metadata) != `{"name":"Alice","status":"editing"}` {
		t.Fatalf("presence_update metadata = %s", updated.Metadata)
	}
}

func TestSubscriptionReplaysDurableEventsBeforePresenceState(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	firstDoc, err := db.CreateDocument("testdb", "testcol", []byte(`{"n":1}`))
	if err != nil {
		t.Fatalf("create first document: %v", err)
	}
	secondDoc, err := db.CreateDocument("testdb", "testcol", []byte(`{"n":2}`))
	if err != nil {
		t.Fatalf("create second document: %v", err)
	}

	events, err := db.ReplayEvents("testdb", "testcol", 0, 10)
	if err != nil {
		t.Fatalf("replay events: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("events = %d, want 2", len(events))
	}
	if events[0].DocumentID != firstDoc.ID || events[1].DocumentID != secondDoc.ID {
		t.Fatalf("unexpected replay order: %#v", events)
	}

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/v1/testdb/testcol/subscribe", nil)
	if err != nil {
		t.Fatalf("subscribe request: %v", err)
	}
	req.Header.Set("Last-Event-ID", strconv.FormatUint(events[0].Sequence, 10))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := (&http.Client{Timeout: 0}).Do(req)
	if err != nil {
		t.Fatalf("failed to connect to SSE: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)
	replayed := readSSEEvent(t, reader)
	if replayed.Action != "insert" {
		t.Fatalf("expected replayed insert, got %s", replayed.Action)
	}
	if replayed.Sequence != events[1].Sequence {
		t.Fatalf("replayed sequence = %d, want %d", replayed.Sequence, events[1].Sequence)
	}
	if replayed.DocumentID != secondDoc.ID {
		t.Fatalf("replayed document_id = %s, want %s", replayed.DocumentID, secondDoc.ID)
	}

	snapshot := readSSEEvent(t, reader)
	if snapshot.Action != "presence_state" {
		t.Fatalf("expected presence_state after replay, got %s", snapshot.Action)
	}
}
