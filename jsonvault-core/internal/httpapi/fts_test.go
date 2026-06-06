package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jsonvault/internal/store"
)

func TestFullTextSearch(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 1. Configure FTS
	ftsPayload := `{"fields": ["title", "content"]}`
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/fts_db/posts/fts", bytes.NewReader([]byte(ftsPayload)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// 2. Insert documents
	docs := []string{
		`{"title": "The quick brown fox", "content": "jumps over the lazy dog"}`,
		`{"title": "Quick recipes", "content": "A brown dog likes to eat food"}`,
		`{"title": "Fox news", "content": "The weather is nice today"}`,
		`{"title": "Totally unrelated", "content": "Just some random text"}`,
	}

	for _, d := range docs {
		req, _ = http.NewRequest("POST", server.URL+"/api/v1/fts_db/posts", bytes.NewReader([]byte(d)))
		req.Header.Set("Content-Type", "application/json")
		http.DefaultClient.Do(req)
	}

	// 3. Search: "quick"
	// Should match doc 1 and doc 2
	req, _ = http.NewRequest("GET", server.URL+"/api/v1/fts_db/posts?search=quick", nil)
	resp, _ = http.DefaultClient.Do(req)

	var results []map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&results)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 documents for 'quick', got %d", len(results))
	}

	// 4. Search: "brown dog"
	// Should intersect and match doc 1 and doc 2
	req, _ = http.NewRequest("GET", server.URL+"/api/v1/fts_db/posts?search=brown+dog", nil)
	resp, _ = http.DefaultClient.Do(req)

	json.NewDecoder(resp.Body).Decode(&results)
	if len(results) != 2 {
		t.Fatalf("expected 2 documents for 'brown dog', got %d", len(results))
	}

	// 5. Search: "fox"
	// Should match doc 1 and doc 3
	req, _ = http.NewRequest("GET", server.URL+"/api/v1/fts_db/posts?search=fox", nil)
	resp, _ = http.DefaultClient.Do(req)

	json.NewDecoder(resp.Body).Decode(&results)
	if len(results) != 2 {
		t.Fatalf("expected 2 documents for 'fox', got %d", len(results))
	}

	// 6. Search non-existent
	req, _ = http.NewRequest("GET", server.URL+"/api/v1/fts_db/posts?search=elephant", nil)
	resp, _ = http.DefaultClient.Do(req)

	json.NewDecoder(resp.Body).Decode(&results)
	if len(results) != 0 {
		t.Fatalf("expected 0 documents for 'elephant', got %d", len(results))
	}
}
