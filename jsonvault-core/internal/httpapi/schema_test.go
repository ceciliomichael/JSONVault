package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jsonvault/internal/store"
)

func TestSchemaValidation(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()
	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 0. Create database and collection
	db.CreateDatabase("test_db")
	db.CreateCollection("test_db", "test_coll")

	// 1. Create a schema requiring an integer "age"
	schemaStr := `{
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"age": {
				"type": "integer"
			}
		},
		"required": ["age"]
	}`

	req, _ := http.NewRequest("PUT", server.URL+"/api/v1/test_db/test_coll/schema", bytes.NewReader([]byte(schemaStr)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 setting schema, got %d", resp.StatusCode)
	}

	// 2. Insert valid document
	validDoc := `{"age": 30}`
	req, _ = http.NewRequest("POST", server.URL+"/api/v1/test_db/test_coll", bytes.NewReader([]byte(validDoc)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 for valid doc, got %d", resp.StatusCode)
	}

	// 3. Insert invalid document (string instead of integer)
	invalidDoc := `{"age": "thirty"}`
	req, _ = http.NewRequest("POST", server.URL+"/api/v1/test_db/test_coll", bytes.NewReader([]byte(invalidDoc)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid doc, got %d", resp.StatusCode)
	}

	// Verify the error contains schema validation failed
	var errResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&errResp)
	if errResp["error"] == nil {
		t.Fatalf("expected error message in response")
	}

	// 4. Remove schema
	req, _ = http.NewRequest("DELETE", server.URL+"/api/v1/test_db/test_coll/schema", nil)
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 deleting schema, got %d", resp.StatusCode)
	}

	// 5. Insert previously invalid document (now it should succeed)
	req, _ = http.NewRequest("POST", server.URL+"/api/v1/test_db/test_coll", bytes.NewReader([]byte(invalidDoc)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 for formerly invalid doc after schema removed, got %d", resp.StatusCode)
	}
}
