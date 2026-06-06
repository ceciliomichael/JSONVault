package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jsonvault/internal/store"
)

func TestQueryOperators(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 1. Insert 3 documents
	docs := []string{
		`{"name":"Alice","age":30,"status":"active"}`,
		`{"name":"Bob","age":25,"status":"inactive"}`,
		`{"name":"Charlie","age":35,"status":"active"}`,
	}

	for _, d := range docs {
		req, _ := http.NewRequest("POST", server.URL+"/api/v1/testdb/users", bytes.NewReader([]byte(d)))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := http.DefaultClient.Do(req)
		if resp.StatusCode != 201 {
			t.Fatalf("failed to insert doc, status: %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// 2. Test exact match filter (remember JSON values must be quoted strings)
	req, _ := http.NewRequest("GET", server.URL+"/api/v1/testdb/users?filter[status]=%22active%22", nil)
	resp, _ := http.DefaultClient.Do(req)
	var res []map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&res)
	resp.Body.Close()

	if len(res) != 2 {
		t.Fatalf("expected 2 active users, got %d (response: %v)", len(res), res)
	}

	// 3. Test sorting (ascending)
	req2, _ := http.NewRequest("GET", server.URL+"/api/v1/testdb/users?sort=age", nil)
	resp2, _ := http.DefaultClient.Do(req2)
	var res2 []map[string]interface{}
	json.NewDecoder(resp2.Body).Decode(&res2)
	resp2.Body.Close()

	if len(res2) != 3 {
		t.Fatalf("expected 3 users, got %d", len(res2))
	}
	if res2[0]["document"].(map[string]interface{})["age"].(float64) != 25 {
		t.Errorf("expected Bob to be first, got %v", res2[0]["document"])
	}

	// 4. Test sorting (descending) with filter
	req3, _ := http.NewRequest("GET", server.URL+"/api/v1/testdb/users?filter[status]=%22active%22&sort=-age", nil)
	resp3, _ := http.DefaultClient.Do(req3)
	var res3 []map[string]interface{}
	json.NewDecoder(resp3.Body).Decode(&res3)
	resp3.Body.Close()

	if len(res3) != 2 {
		t.Fatalf("expected 2 active users, got %d", len(res3))
	}
	if res3[0]["document"].(map[string]interface{})["name"] != "Charlie" {
		t.Errorf("expected Charlie to be first (age 35), got %v", res3[0]["document"])
	}
}
