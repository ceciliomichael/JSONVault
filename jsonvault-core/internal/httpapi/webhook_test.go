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
	var receivedTimestamp string
	var receivedEventID string
	var receivedSignatureV2 string

	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedPayload)
		receivedSignature = r.Header.Get("X-JSONVault-Signature")
		receivedTimestamp = r.Header.Get("X-JSONVault-Timestamp")
		receivedEventID = r.Header.Get("X-JSONVault-Event-ID")
		receivedSignatureV2 = r.Header.Get("X-JSONVault-Signature-V2")
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
	if receivedTimestamp == "" || receivedEventID == "" || receivedSignatureV2 == "" {
		t.Fatalf("expected replay protection headers, got timestamp=%q eventID=%q signatureV2=%q", receivedTimestamp, receivedEventID, receivedSignatureV2)
	}
}

func TestWebhookRejectsInvalidConfig(t *testing.T) {
	t.Setenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS", "")

	db, err := store.New(t.TempDir(), 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	payload := `{"webhooks":[{"url":"http://127.0.0.1:8080/hook","events":["insert"]}]}`
	req, _ := http.NewRequest(http.MethodPut, server.URL+"/api/v1/wh_db/users/webhooks", bytes.NewReader([]byte(payload)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("SetWebhooks: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}
