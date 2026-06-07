package auth

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

func TestGeneratedKeyIncludesLifecycleClaimsAndCanBeRevoked(t *testing.T) {
	a := New("admin", []byte("secret_signing_key"))

	key, err := a.GenerateKeyWithMetadata(ScopeReadOnly, "mydb", "mycoll")
	if err != nil {
		t.Fatalf("GenerateKeyWithMetadata: %v", err)
	}
	if key.ID == "" {
		t.Fatal("expected token id")
	}
	if time.Until(key.ExpiresAt) < 89*24*time.Hour {
		t.Fatalf("unexpected expiry: %v", key.ExpiresAt)
	}

	ok, _, _, _ := a.Authenticate("Bearer " + key.Token)
	if !ok {
		t.Fatal("generated token should authenticate before revocation")
	}

	a.RevokeTokenID(key.ID)
	ok, _, _, _ = a.Authenticate("Bearer " + key.Token)
	if ok {
		t.Fatal("revoked token should not authenticate")
	}
}

func TestProjectAdminCapabilitiesRoundTrip(t *testing.T) {
	a := New("admin", []byte("secret_signing_key"))
	key, err := a.GenerateKeyWithMetadata(ScopeProjectAdmin, "project", "*")
	if err != nil {
		t.Fatalf("GenerateKeyWithMetadata: %v", err)
	}
	ctx, ok := a.AuthenticateContext("Bearer " + key.Token)
	if !ok {
		t.Fatal("project admin token should authenticate")
	}
	if ctx.Scope != ScopeProjectAdmin {
		t.Fatalf("scope = %s, want %s", ctx.Scope, ScopeProjectAdmin)
	}
	hasIndexes := false
	for _, capability := range ctx.Capabilities {
		if capability == CapabilityIndexesManage {
			hasIndexes = true
			break
		}
	}
	if !hasIndexes {
		t.Fatalf("project admin capabilities missing indexes:manage: %#v", ctx.Capabilities)
	}
}

func TestSignedAdminJWTDoesNotAuthenticate(t *testing.T) {
	secret := []byte("secret_signing_key")
	a := New("admin", secret)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":      string(ScopeAdmin),
		"database":   "*",
		"collection": "*",
		"iat":        time.Now().Unix(),
		"nbf":        time.Now().Unix(),
		"exp":        time.Now().Add(time.Hour).Unix(),
		"jti":        "signed-admin",
	})
	tokenString, err := token.SignedString(secret)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	ok, _, _, _ := a.Authenticate("Bearer " + tokenString)
	if ok {
		t.Fatal("signed admin JWT should not authenticate")
	}
}

func TestRevocationFilePersistsRevokedTokenIDs(t *testing.T) {
	path := t.TempDir() + "/revoked.json"
	secret := []byte("secret_signing_key")

	a, err := NewWithRevocationFile("admin", secret, path)
	if err != nil {
		t.Fatalf("NewWithRevocationFile: %v", err)
	}
	key, err := a.GenerateKeyWithMetadata(ScopeReadOnly, "mydb", "mycoll")
	if err != nil {
		t.Fatalf("GenerateKeyWithMetadata: %v", err)
	}
	if err := a.RevokeTokenID(key.ID); err != nil {
		t.Fatalf("RevokeTokenID: %v", err)
	}

	restarted, err := NewWithRevocationFile("admin", secret, path)
	if err != nil {
		t.Fatalf("NewWithRevocationFile restarted: %v", err)
	}
	ok, _, _, _ := restarted.Authenticate("Bearer " + key.Token)
	if ok {
		t.Fatal("revoked token should stay revoked after reload")
	}
}

func TestExpiredJWTDoesNotAuthenticate(t *testing.T) {
	secret := []byte("secret_signing_key")
	a := New("admin", secret)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":      string(ScopeReadOnly),
		"database":   "mydb",
		"collection": "mycoll",
		"iat":        time.Now().Add(-2 * time.Hour).Unix(),
		"nbf":        time.Now().Add(-2 * time.Hour).Unix(),
		"exp":        time.Now().Add(-1 * time.Hour).Unix(),
		"jti":        "expired-token",
	})
	tokenString, err := token.SignedString(secret)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	ok, _, _, _ := a.Authenticate("Bearer " + tokenString)
	if ok {
		t.Fatal("expired token should not authenticate")
	}
}

func TestJWTWithoutTokenIDDoesNotAuthenticate(t *testing.T) {
	secret := []byte("secret_signing_key")
	a := New("admin", secret)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":      string(ScopeReadOnly),
		"database":   "mydb",
		"collection": "mycoll",
		"exp":        time.Now().Add(time.Hour).Unix(),
	})
	tokenString, err := token.SignedString(secret)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	ok, _, _, _ := a.Authenticate("Bearer " + tokenString)
	if ok {
		t.Fatal("token without jti should not authenticate")
	}
}

func TestRejectsUnexpectedSigningMethod(t *testing.T) {
	a := New("admin", []byte("secret_signing_key"))
	token := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"scope":      string(ScopeReadOnly),
		"database":   "mydb",
		"collection": "mycoll",
		"exp":        time.Now().Add(time.Hour).Unix(),
		"jti":        "none-token",
	})
	tokenString, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil && !errors.Is(err, jwt.ErrTokenUnverifiable) {
		t.Fatalf("SignedString: %v", err)
	}

	ok, _, _, _ := a.Authenticate("Bearer " + tokenString)
	if ok {
		t.Fatal("none-signed token should not authenticate")
	}
}
