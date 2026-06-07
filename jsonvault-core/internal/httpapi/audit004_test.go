package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

func TestProjectAdminCanManageOwnedDatabase(t *testing.T) {
	db, err := store.New(t.TempDir(), 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()
	if _, err := db.CreateDatabase("proj"); err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	if _, err := db.CreateCollection("proj", "users"); err != nil {
		t.Fatalf("CreateCollection users: %v", err)
	}

	server, adminKey := newAuthedTestServer(t, db)
	token := createToken(t, server.URL, adminKey, `{"scope":"project_admin","database":"proj","collection":"*"}`)

	req, _ := http.NewRequest(http.MethodGet, server.URL+"/api/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET /me: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /me status = %d", resp.StatusCode)
	}
	var me map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		t.Fatalf("decode /me: %v", err)
	}
	if me["scope"] != "project_admin" {
		t.Fatalf("scope = %v, want project_admin", me["scope"])
	}

	doProjectRequest(t, token, http.MethodPost, server.URL+"/api/v1/proj/users/indexes", `{"field":"status"}`, http.StatusCreated)
	doProjectRequest(t, token, http.MethodPost, server.URL+"/api/v1/proj/users/fts", `{"fields":["name","bio"]}`, http.StatusOK)

	req, _ = http.NewRequest(http.MethodGet, server.URL+"/api/v1/proj/users/fts", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET fts: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET fts status = %d", resp.StatusCode)
	}
	var fts map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&fts); err != nil {
		t.Fatalf("decode fts: %v", err)
	}
	if configured, _ := fts["configured"].(bool); !configured {
		t.Fatalf("expected FTS configured response, got %#v", fts)
	}

	doProjectRequest(t, token, http.MethodPost, server.URL+"/api/v1/proj/users/schema/validate", `{"type":"object"}`, http.StatusOK)
	doProjectRequest(t, token, http.MethodPut, server.URL+"/api/v1/proj/users/schema", `{"type":"object"}`, http.StatusOK)
	doProjectRequest(t, token, http.MethodPost, server.URL+"/api/v1/proj/collections", `{"name":"orders"}`, http.StatusCreated)
	doProjectRequest(t, token, http.MethodPut, server.URL+"/api/v1/proj/users/webhooks", `{"webhooks":[]}`, http.StatusOK)

	doProjectRequest(t, token, http.MethodPost, server.URL+"/api/v1/other/users/indexes", `{"field":"status"}`, http.StatusForbidden)
}

func TestProjectAdminCanMintOnlyScopedRuntimeKeys(t *testing.T) {
	db, err := store.New(t.TempDir(), 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()
	server, adminKey := newAuthedTestServer(t, db)
	projectToken := createToken(t, server.URL, adminKey, `{"scope":"project_admin","database":"proj","collection":"*"}`)

	doProjectRequest(t, projectToken, http.MethodPost, server.URL+"/api/v1/admin/keys", `{"scope":"read_write","database":"proj","collection":"users"}`, http.StatusCreated)
	doProjectRequest(t, projectToken, http.MethodPost, server.URL+"/api/v1/admin/keys", `{"scope":"read_write","database":"other","collection":"users"}`, http.StatusForbidden)
	doProjectRequest(t, projectToken, http.MethodPost, server.URL+"/api/v1/admin/keys", `{"scope":"project_admin","database":"proj","collection":"*"}`, http.StatusForbidden)
}

func TestAsyncIndexOperationStatus(t *testing.T) {
	db, err := store.New(t.TempDir(), 10, nil)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()
	if _, err := db.CreateDatabase("proj"); err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	if _, err := db.CreateCollection("proj", "users"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}

	server, adminKey := newAuthedTestServer(t, db)
	token := createToken(t, server.URL, adminKey, `{"scope":"project_admin","database":"proj","collection":"*"}`)

	req, _ := http.NewRequest(http.MethodPost, server.URL+"/api/v1/proj/users/indexes?async=true", bytes.NewReader([]byte(`{"field":"kind"}`)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("async create index: %v", err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("async create index status = %d", resp.StatusCode)
	}
	var op map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&op); err != nil {
		t.Fatalf("decode operation: %v", err)
	}
	id, _ := op["operation_id"].(string)
	if id == "" {
		t.Fatalf("missing operation_id in %#v", op)
	}

	for i := 0; i < 20; i++ {
		req, _ = http.NewRequest(http.MethodGet, server.URL+"/api/v1/operations/"+id, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err = http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("get operation: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("get operation status = %d", resp.StatusCode)
		}
		op = map[string]any{}
		if err := json.NewDecoder(resp.Body).Decode(&op); err != nil {
			t.Fatalf("decode get operation: %v", err)
		}
		if op["state"] == "ready" {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("operation did not become ready")
}

func TestQueryLimitExceededIncludesReasonAndAdvice(t *testing.T) {
	db, err := store.NewWithOptions(t.TempDir(), 10, nil, store.Options{MaxResponseBytes: 80})
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	defer db.Close()
	if _, err := db.CreateDocument("proj", "docs", []byte(`{"name":"larger document payload"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	server := httptest.NewServer(NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024}))
	defer server.Close()

	resp, err := http.Get(server.URL + "/api/v1/proj/docs?limit=10")
	if err != nil {
		t.Fatalf("list docs: %v", err)
	}
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", resp.StatusCode)
	}
	var body map[string]map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	errBody := body["error"]
	if errBody["code"] != "query_limit_exceeded" {
		t.Fatalf("code = %v", errBody["code"])
	}
	if errBody["reason"] != "response_bytes_limit" {
		t.Fatalf("reason = %v", errBody["reason"])
	}
	if _, ok := errBody["advice"].([]any); !ok {
		t.Fatalf("missing advice in %#v", errBody)
	}
}

func newAuthedTestServer(t *testing.T, db *store.Store) (*httptest.Server, string) {
	t.Helper()
	adminKey := "admin-secret"
	authenticator := auth.New(adminKey, []byte("audit004-secret"))
	server := httptest.NewServer(NewHandler(db, authenticator, Options{MaxBodyBytes: 1024 * 1024}))
	t.Cleanup(server.Close)
	return server, adminKey
}

func createToken(t *testing.T, baseURL, adminKey, body string) string {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/keys", bytes.NewReader([]byte(body)))
	req.Header.Set("Authorization", "Bearer "+adminKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create token status = %d", resp.StatusCode)
	}
	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("decode token: %v", err)
	}
	token, _ := data["token"].(string)
	if token == "" {
		t.Fatalf("missing token in %#v", data)
	}
	return token
}

func doProjectRequest(t *testing.T, token, method, url, body string, want int) {
	t.Helper()
	req, _ := http.NewRequest(method, url, bytes.NewReader([]byte(body)))
	req.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	if resp.StatusCode != want {
		t.Fatalf("%s %s status = %d, want %d", method, url, resp.StatusCode, want)
	}
}
