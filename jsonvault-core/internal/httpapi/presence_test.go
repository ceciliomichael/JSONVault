package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"jsonvault/internal/store"
)

func TestPresenceAPI(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 1. Check initial presence (should be 0)
	resp, _ := http.Get(server.URL + "/api/v1/testdb/testcol/presence")
	var pres map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&pres)
	resp.Body.Close()

	if int(pres["subscribers"].(float64)) != 0 {
		t.Errorf("expected 0 subscribers, got %v", pres["subscribers"])
	}

	// 2. Connect 2 clients
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	client1, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/api/v1/testdb/testcol/subscribe", nil)
	client2, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/api/v1/testdb/testcol/subscribe", nil)

	go http.DefaultClient.Do(client1)
	go http.DefaultClient.Do(client2)

	// Wait for connections to register
	time.Sleep(200 * time.Millisecond)

	// 3. Check presence (should be 2)
	resp2, _ := http.Get(server.URL + "/api/v1/testdb/testcol/presence")
	var pres2 map[string]interface{}
	json.NewDecoder(resp2.Body).Decode(&pres2)
	resp2.Body.Close()

	if int(pres2["subscribers"].(float64)) != 2 {
		t.Errorf("expected 2 subscribers, got %v", pres2["subscribers"])
	}

	// 4. Disconnect clients
	cancel()
	time.Sleep(200 * time.Millisecond)

	// 5. Check presence again (should be 0)
	resp3, _ := http.Get(server.URL + "/api/v1/testdb/testcol/presence")
	var pres3 map[string]interface{}
	json.NewDecoder(resp3.Body).Decode(&pres3)
	resp3.Body.Close()

	if int(pres3["subscribers"].(float64)) != 0 {
		t.Errorf("expected 0 subscribers after disconnect, got %v", pres3["subscribers"])
	}
}
