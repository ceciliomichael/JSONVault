package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

func TestJWTAuthentication(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	adminKey := "super_secret_admin"
	jwtSecret := []byte("secret_signing_key")
	authenticator := auth.New(adminKey, jwtSecret)

	handler := NewHandler(db, authenticator, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 1. Unauthenticated request should fail 401
	req1, _ := http.NewRequest("GET", server.URL+"/api/v1/databases", nil)
	resp1, _ := http.DefaultClient.Do(req1)
	if resp1.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp1.StatusCode)
	}

	// 2. Admin key should succeed
	req2, _ := http.NewRequest("GET", server.URL+"/api/v1/databases", nil)
	req2.Header.Set("Authorization", "Bearer "+adminKey)
	resp2, _ := http.DefaultClient.Do(req2)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for admin, got %d", resp2.StatusCode)
	}

	// 3. Create a JWT key scoped to "read_write" for "mydb" and "users" collection
	createReq := `{"scope":"read_write","database":"mydb","collection":"users"}`
	req3, _ := http.NewRequest("POST", server.URL+"/api/v1/admin/keys", bytes.NewReader([]byte(createReq)))
	req3.Header.Set("Authorization", "Bearer "+adminKey)
	req3.Header.Set("Content-Type", "application/json")
	resp3, _ := http.DefaultClient.Do(req3)
	
	if resp3.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 when creating key, got %d", resp3.StatusCode)
	}

	var keyData map[string]interface{}
	err = json.NewDecoder(resp3.Body).Decode(&keyData)
	if err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	
	tokenVal, ok := keyData["token"]
	if !ok || tokenVal == nil {
		t.Fatalf("token is missing from response: %v", keyData)
	}
	token := tokenVal.(string)

	// 4. Try to insert into "mydb/users" with the JWT (should succeed)
	insertReq := `{"hello":"world"}`
	req4, _ := http.NewRequest("POST", server.URL+"/api/v1/mydb/users", bytes.NewReader([]byte(insertReq)))
	req4.Header.Set("Authorization", "Bearer "+token)
	req4.Header.Set("Content-Type", "application/json")
	resp4, _ := http.DefaultClient.Do(req4)
	if resp4.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 for valid JWT insert, got %d", resp4.StatusCode)
	}

	// 5. Try to insert into "mydb/other_coll" with the JWT (should fail 403 Forbidden)
	req5, _ := http.NewRequest("POST", server.URL+"/api/v1/mydb/other_coll", bytes.NewReader([]byte(insertReq)))
	req5.Header.Set("Authorization", "Bearer "+token)
	req5.Header.Set("Content-Type", "application/json")
	resp5, _ := http.DefaultClient.Do(req5)
	if resp5.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 when violating collection scope, got %d", resp5.StatusCode)
	}

	// 6. Try to list databases with the JWT (should fail 403 because it's not admin scope)
	req6, _ := http.NewRequest("GET", server.URL+"/api/v1/databases", nil)
	req6.Header.Set("Authorization", "Bearer "+token)
	resp6, _ := http.DefaultClient.Do(req6)
	if resp6.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 when accessing admin route with read_write JWT, got %d", resp6.StatusCode)
	}
}
