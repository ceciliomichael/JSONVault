package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

func TestAPIRequiresAuthorization(t *testing.T) {
	handler := testHandler(t)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/databases", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestAPIDatabaseCollectionAndDocumentLifecycle(t *testing.T) {
	handler := testHandler(t)

	// Create database
	response := doJSON(t, handler, http.MethodPost, "/api/v1/databases", `{"name":"testdb"}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("create database status = %d, body=%s", response.Code, response.Body.String())
	}

	response = doJSON(t, handler, http.MethodPost, "/api/v1/databases", `{"name":"testdb"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("idempotent create database status = %d, body=%s", response.Code, response.Body.String())
	}

	response = doJSON(t, handler, http.MethodGet, "/api/v1/databases", "")
	if response.Code != http.StatusOK {
		t.Fatalf("list databases status = %d, body=%s", response.Code, response.Body.String())
	}
	var listedDBs []string
	if err := json.Unmarshal(response.Body.Bytes(), &listedDBs); err != nil {
		t.Fatalf("decode databases response: %v", err)
	}
	if len(listedDBs) != 1 || listedDBs[0] != "testdb" {
		t.Fatalf("unexpected databases: %#v", listedDBs)
	}

	// Create collection
	response = doJSON(t, handler, http.MethodPost, "/api/v1/testdb/collections", `{"name":"users"}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("create collection status = %d, body=%s", response.Code, response.Body.String())
	}

	response = doJSON(t, handler, http.MethodPost, "/api/v1/testdb/collections", `{"name":"users"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("idempotent create collection status = %d, body=%s", response.Code, response.Body.String())
	}

	response = doJSON(t, handler, http.MethodGet, "/api/v1/testdb/collections", "")
	if response.Code != http.StatusOK {
		t.Fatalf("list collections status = %d, body=%s", response.Code, response.Body.String())
	}
	var listed []string
	if err := json.Unmarshal(response.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode collections response: %v", err)
	}
	if len(listed) != 1 || listed[0] != "users" {
		t.Fatalf("unexpected collections: %#v", listed)
	}

	// Create Document
	response = doJSON(t, handler, http.MethodPost, "/api/v1/testdb/users", `{"name":"Alice","active":true}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("create document status = %d, body=%s", response.Code, response.Body.String())
	}
	var created store.Document
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.ID == "" || string(created.Document) != `{"name":"Alice","active":true}` {
		t.Fatalf("unexpected created document: %#v", created)
	}

	// Get Document
	response = doJSON(t, handler, http.MethodGet, "/api/v1/testdb/users/"+created.ID, "")
	if response.Code != http.StatusOK {
		t.Fatalf("get document status = %d, body=%s", response.Code, response.Body.String())
	}

	// Put Document
	response = doJSON(t, handler, http.MethodPut, "/api/v1/testdb/users/"+created.ID, `{"name":"Alice","active":false}`)
	if response.Code != http.StatusOK {
		t.Fatalf("put document status = %d, body=%s", response.Code, response.Body.String())
	}

	// List Documents
	response = doJSON(t, handler, http.MethodGet, "/api/v1/testdb/users", "")
	if response.Code != http.StatusOK {
		t.Fatalf("list documents status = %d, body=%s", response.Code, response.Body.String())
	}
	var documents []store.Document
	if err := json.Unmarshal(response.Body.Bytes(), &documents); err != nil {
		t.Fatalf("decode documents response: %v", err)
	}
	if len(documents) != 1 || documents[0].ID != created.ID {
		t.Fatalf("unexpected document list: %#v", documents)
	}

	// Delete Document
	response = doJSON(t, handler, http.MethodDelete, "/api/v1/testdb/users/"+created.ID, "")
	if response.Code != http.StatusOK {
		t.Fatalf("delete document status = %d, body=%s", response.Code, response.Body.String())
	}

	// Delete Collection
	response = doJSON(t, handler, http.MethodDelete, "/api/v1/testdb/collections/users", "")
	if response.Code != http.StatusOK {
		t.Fatalf("delete collection status = %d, body=%s", response.Code, response.Body.String())
	}

	// Delete Database
	response = doJSON(t, handler, http.MethodDelete, "/api/v1/testdb", "")
	if response.Code != http.StatusOK {
		t.Fatalf("delete database status = %d, body=%s", response.Code, response.Body.String())
	}
}

func TestAPIRejectsInvalidDocumentJSON(t *testing.T) {
	handler := testHandler(t)

	response := doJSON(t, handler, http.MethodPost, "/api/v1/testdb/users", `not-json`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
}

func TestAPIRejectsOversizedManagementBody(t *testing.T) {
	handler := testHandler(t)

	response := doJSON(t, handler, http.MethodPost, "/api/v1/databases", `{"name":"`+strings.Repeat("x", 2048)+`"}`)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d body=%s", response.Code, http.StatusRequestEntityTooLarge, response.Body.String())
	}
}

func testHandler(t *testing.T) http.Handler {
	t.Helper()
	db, err := store.New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	authenticator, err := auth.New([]string{"secret"})
	if err != nil {
		t.Fatalf("auth.New: %v", err)
	}
	return NewHandler(db, authenticator, Options{MaxBodyBytes: 1024})
}

func doJSON(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body == "" {
		reader = bytes.NewReader(nil)
	} else {
		reader = bytes.NewReader([]byte(body))
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Authorization", "Bearer secret")
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
