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

func TestTransientPublish(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	req, _ := http.NewRequest("GET", server.URL+"/api/v1/testdb/testcol/subscribe", nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req = req.WithContext(ctx)

	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer resp.Body.Close()

	go func() {
		time.Sleep(100 * time.Millisecond)
		payload := []byte(`{"message":"hello world"}`)
		postReq, _ := http.NewRequest("POST", server.URL+"/api/v1/testdb/testcol/publish", bytes.NewReader(payload))
		postReq.Header.Set("Content-Type", "application/json")
		postResp, _ := http.DefaultClient.Do(postReq)
		if postResp.StatusCode != http.StatusAccepted {
			t.Errorf("expected 202 Accepted, got %d", postResp.StatusCode)
		}
		postResp.Body.Close()
	}()

	reader := bufio.NewReader(resp.Body)
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("failed to read from stream: %v", err)
	}

	line = strings.TrimSpace(line)
	jsonStr := strings.TrimPrefix(line, "data: ")
	
	var event store.Event
	json.Unmarshal([]byte(jsonStr), &event)

	if event.Action != "publish" {
		t.Errorf("expected action 'publish', got '%s'", event.Action)
	}
	
	var docData map[string]interface{}
	json.Unmarshal(event.Document, &docData)
	if docData["message"] != "hello world" {
		t.Errorf("expected message 'hello world', got %v", docData)
	}
}
