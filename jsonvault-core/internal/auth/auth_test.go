package auth

import (
	"testing"
)

func TestAuthenticator(t *testing.T) {
	adminKey := "super_secret_admin"
	jwtSecret := []byte("secret_signing_key")
	a := New(adminKey, jwtSecret)

	// 1. Test Admin Key
	ok, scope, db, coll := a.Authenticate("Bearer " + adminKey)
	if !ok || scope != ScopeAdmin || db != "*" || coll != "*" {
		t.Errorf("admin key failed")
	}

	// 2. Test Invalid Token
	ok, _, _, _ = a.Authenticate("Bearer invalid")
	if ok {
		t.Errorf("invalid token should fail")
	}

	// 3. Test Generate and Authenticate JWT
	token, err := a.GenerateKey(ScopeReadWrite, "mydb", "mycoll")
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}

	ok, scope, db, coll = a.Authenticate("Bearer " + token)
	if !ok {
		t.Fatalf("failed to authenticate valid JWT")
	}
	if scope != ScopeReadWrite {
		t.Errorf("expected scope %s, got %s", ScopeReadWrite, scope)
	}
	if db != "mydb" {
		t.Errorf("expected db mydb, got %s", db)
	}
	if coll != "mycoll" {
		t.Errorf("expected coll mycoll, got %s", coll)
	}
}
