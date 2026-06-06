package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"jsonvault/internal/store"
)

func TestWebhooks(t *testing.T) {
	t.Setenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS", "true")

	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// Setup a dummy receiver server to act as the webhook target
	var wg sync.WaitGroup
	var receivedPayload map[string]interface{}
	var receivedSignature string

	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedPayload)
		receivedSignature = r.Header.Get("X-JSONVault-Signature")
		wg.Done()
		w.WriteHeader(200)
	}))
	defer receiver.Close()

	// 1. Set Webhook
	payload := `{
		"webhooks": [
			{ "url": "` + receiver.URL + `", "events": ["insert", "update"] }
		]
	}`

	req, _ := http.NewRequest("PUT", server.URL+"/api/v1/wh_db/users/webhooks", bytes.NewReader([]byte(payload)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var setResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&setResp)
	secret, ok := setResp["webhook_secret"].(string)
	if !ok || secret == "" {
		t.Fatalf("expected a webhook_secret to be returned")
	}

	// 2. Trigger an insert to fire the webhook
	wg.Add(1)
	insertReq, _ := http.NewRequest("POST", server.URL+"/api/v1/wh_db/users", bytes.NewReader([]byte(`{"hello": "world"}`)))
	insertReq.Header.Set("Content-Type", "application/json")
	http.DefaultClient.Do(insertReq)

	// Wait for the async webhook to arrive
	c := make(chan struct{})
	go func() {
		defer close(c)
		wg.Wait()
	}()

	select {
	case <-c:
		// Success
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for webhook to be received")
	}

	if receivedPayload["action"] != "insert" {
		t.Fatalf("expected action 'insert', got %v", receivedPayload["action"])
	}

	if receivedSignature == "" {
		t.Fatalf("expected X-JSONVault-Signature header")
	}
}
