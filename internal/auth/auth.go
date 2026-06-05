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

type Authenticator struct {
	keyHashes [][sha256.Size]byte
}

func New(keys []string) (*Authenticator, error) {
	hashes := make([][sha256.Size]byte, 0, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		hashes = append(hashes, sha256.Sum256([]byte(key)))
	}
	if len(hashes) == 0 {
		return nil, ErrNoAPIKeys
	}
	return &Authenticator{keyHashes: hashes}, nil
}

func (a *Authenticator) Authenticate(header string) bool {
	scheme, token, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return false
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return false
	}

	candidate := sha256.Sum256([]byte(token))
	match := 0
	for _, keyHash := range a.keyHashes {
		match |= subtle.ConstantTimeCompare(candidate[:], keyHash[:])
	}
	return match == 1
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.Authenticate(r.Header.Get("Authorization")) {
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
		next.ServeHTTP(w, r)
	})
}
