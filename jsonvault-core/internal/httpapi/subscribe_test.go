package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

	// We expect the first event to be our insert
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("failed to read from stream: %v", err)
	}

	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "data: ") {
		t.Fatalf("expected SSE data format, got: %s", line)
	}

	jsonStr := strings.TrimPrefix(line, "data: ")

	var event store.Event
	if err := json.Unmarshal([]byte(jsonStr), &event); err != nil {
		t.Fatalf("failed to parse event JSON: %v", err)
	}

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
