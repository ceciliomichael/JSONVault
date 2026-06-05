package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

var ErrNoAPIKeys = errors.New("at least one API key is required")

type Scope string

const (
	ScopeAdmin Scope = "admin"
	ScopeReadWrite Scope = "read_write"
	ScopeReadOnly  Scope = "read_only"
)

type keyHash struct {
	hash  [sha256.Size]byte
	scope Scope
}

type Authenticator struct {
	keyHashes []keyHash
}

func New(keys []string) (*Authenticator, error) {
	hashes := make([]keyHash, 0, len(keys))
	for _, keyStr := range keys {
		keyStr = strings.TrimSpace(keyStr)
		if keyStr == "" {
			continue
		}
		
		parts := strings.SplitN(keyStr, ":", 2)
		key := parts[0]
		scope := ScopeAdmin
		if len(parts) == 2 {
			scope = Scope(parts[1])
		}

		hashes = append(hashes, keyHash{
			hash:  sha256.Sum256([]byte(key)),
			scope: scope,
		})
	}
	if len(hashes) == 0 {
		return nil, ErrNoAPIKeys
	}
	return &Authenticator{keyHashes: hashes}, nil
}

func (a *Authenticator) Authenticate(header string) (bool, Scope) {
	scheme, token, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return false, ""
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return false, ""
	}

	candidate := sha256.Sum256([]byte(token))
	for _, kh := range a.keyHashes {
		if subtle.ConstantTimeCompare(candidate[:], kh.hash[:]) == 1 {
			return true, kh.scope
		}
	}
	return false, ""
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}

		ok, scope := a.Authenticate(r.Header.Get("Authorization"))
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("WWW-Authenticate", `Bearer realm="jsonvault"`)
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": map[string]string{
					"code":    "unauthorized",
					"message": "missing or invalid bearer token",
				},
			})
			return
		}
		
		r.Header.Set("X-API-Scope", string(scope))
		next.ServeHTTP(w, r)
	})
}
