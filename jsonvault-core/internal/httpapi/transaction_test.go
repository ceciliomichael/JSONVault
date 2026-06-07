package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jsonvault/internal/store"
)

func TestAtomicTransactions(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 0. Seed data
	db.CreateDatabase("tx_db")
	db.CreateCollection("tx_db", "users")
	doc1, _ := db.CreateDocument("tx_db", "users", []byte(`{"balance": 100}`))
	doc2, _ := db.CreateDocument("tx_db", "users", []byte(`{"balance": 100}`))

	// 1. Successful Transaction
	txPayload := `{
		"operations": [
			{ "action": "put", "collection": "users", "id": "` + doc1.ID + `", "body": {"balance": 90}, "expected_etag": ` + doc1.ETag + ` },
			{ "action": "put", "collection": "users", "id": "` + doc2.ID + `", "body": {"balance": 110}, "expected_etag": ` + doc2.ETag + ` }
		]
	}`

	req, _ := http.NewRequest("POST", server.URL+"/api/v1/tx_db/transactions", bytes.NewReader([]byte(txPayload)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errResp)
		t.Fatalf("expected 200 for valid transaction, got %d. Body: %v", resp.StatusCode, errResp)
	}

	// 2. Failed Transaction (Rollback)
	// We will try to deduct 10 from doc1, add 10 to doc2, but doc2 will have a wrong ETag.
	// doc1's balance should REMAIN at 90 because it rolls back!
	doc1Updated, _ := db.GetDocument("tx_db", "users", doc1.ID)

	badTxPayload := `{
		"operations": [
			{ "action": "put", "collection": "users", "id": "` + doc1.ID + `", "body": {"balance": 80}, "expected_etag": ` + doc1Updated.ETag + ` },
			{ "action": "put", "collection": "users", "id": "` + doc2.ID + `", "body": {"balance": 120}, "expected_etag": "\"WRONG_ETAG\"" }
		]
	}`

	req, _ = http.NewRequest("POST", server.URL+"/api/v1/tx_db/transactions", bytes.NewReader([]byte(badTxPayload)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = http.DefaultClient.Do(req)

	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusPreconditionFailed {
		t.Fatalf("expected 400 or 412 for invalid transaction, got %d", resp.StatusCode)
	}

	// Verify rollback
	doc1Final, _ := db.GetDocument("tx_db", "users", doc1.ID)
	var parsed1 map[string]interface{}
	json.Unmarshal(doc1Final.Document, &parsed1)

	if parsed1["balance"].(float64) != 90 {
		t.Fatalf("expected doc1 balance to rollback to 90, got %v", parsed1["balance"])
	}
}

func TestTransactionRejectsTooManyOperations(t *testing.T) {
	db, err := store.New(t.TempDir(), 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	ops := make([]map[string]any, store.MaxTransactionOps+1)
	for i := range ops {
		ops[i] = map[string]any{
			"action":     "delete",
			"collection": "users",
			"id":         "doc",
		}
	}
	payload, err := json.Marshal(map[string]any{"operations": ops})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	req, _ := http.NewRequest(http.MethodPost, server.URL+"/api/v1/tx_db/transactions", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("transaction: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}
