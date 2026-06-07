package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Scope string

const (
	ScopeAdmin     Scope = "admin"
	ScopeReadWrite Scope = "read_write"
	ScopeReadOnly  Scope = "read_only"
)

type Authenticator struct {
	adminKey       string
	jwtSecret      []byte
	revocationPath string
	mu             sync.RWMutex
	revoked        map[string]struct{}
}

type GeneratedKey struct {
	Token     string
	ID        string
	ExpiresAt time.Time
}

func New(adminKey string, jwtSecret []byte) *Authenticator {
	return &Authenticator{
		adminKey:  adminKey,
		jwtSecret: jwtSecret,
		revoked:   make(map[string]struct{}),
	}
}

func NewWithRevocationFile(adminKey string, jwtSecret []byte, revocationPath string) (*Authenticator, error) {
	a := New(adminKey, jwtSecret)
	a.revocationPath = strings.TrimSpace(revocationPath)
	if a.revocationPath == "" {
		return a, nil
	}
	if err := a.loadRevocations(); err != nil {
		return nil, err
	}
	return a, nil
}

func (a *Authenticator) Authenticate(header string) (bool, Scope, string, string) {
	scheme, tokenString, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return false, "", "", ""
	}
	tokenString = strings.TrimSpace(tokenString)
	if tokenString == "" {
		return false, "", "", ""
	}

	if tokenString == a.adminKey {
		return true, ScopeAdmin, "*", "*"
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return false, "", "", ""
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return false, "", "", ""
	}

	scopeStr, _ := claims["scope"].(string)
	db, _ := claims["database"].(string)
	coll, _ := claims["collection"].(string)
	jti, _ := claims["jti"].(string)
	if jti == "" || a.isRevoked(jti) {
		return false, "", "", ""
	}

	return true, Scope(scopeStr), db, coll
}

func (a *Authenticator) GenerateKey(scope Scope, database, collection string) (string, error) {
	key, err := a.GenerateKeyWithMetadata(scope, database, collection)
	if err != nil {
		return "", err
	}
	return key.Token, nil
}

func (a *Authenticator) GenerateKeyWithMetadata(scope Scope, database, collection string) (GeneratedKey, error) {
	jti, err := generateTokenID()
	if err != nil {
		return GeneratedKey{}, err
	}
	now := time.Now()
	expiresAt := now.Add(90 * 24 * time.Hour)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":      string(scope),
		"database":   database,
		"collection": collection,
		"iat":        now.Unix(),
		"nbf":        now.Unix(),
		"exp":        expiresAt.Unix(),
		"jti":        jti,
	})
	tokenString, err := token.SignedString(a.jwtSecret)
	if err != nil {
		return GeneratedKey{}, err
	}
	return GeneratedKey{
		Token:     tokenString,
		ID:        jti,
		ExpiresAt: expiresAt,
	}, nil
}

func (a *Authenticator) RevokeTokenID(jti string) error {
	jti = strings.TrimSpace(jti)
	if jti == "" {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.revoked[jti] = struct{}{}
	return a.persistRevocationsLocked()
}

func (a *Authenticator) isRevoked(jti string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	_, ok := a.revoked[jti]
	return ok
}

func generateTokenID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func (a *Authenticator) loadRevocations() error {
	data, err := os.ReadFile(a.revocationPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if len(data) == 0 {
		return nil
	}

	var ids []string
	if err := json.Unmarshal(data, &ids); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			a.revoked[id] = struct{}{}
		}
	}
	return nil
}

func (a *Authenticator) persistRevocationsLocked() error {
	if a.revocationPath == "" {
		return nil
	}

	ids := make([]string, 0, len(a.revoked))
	for id := range a.revoked {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	data, err := json.MarshalIndent(ids, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := a.revocationPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, a.revocationPath); err != nil {
		if removeErr := os.Remove(a.revocationPath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			_ = os.Remove(tmpPath)
			return err
		}
		if err := os.Rename(tmpPath, a.revocationPath); err != nil {
			_ = os.Remove(tmpPath)
			return err
		}
	}
	return nil
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}

		ok, scope, db, coll := a.Authenticate(r.Header.Get("Authorization"))
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
		r.Header.Set("X-API-Database", db)
		r.Header.Set("X-API-Collection", coll)
		next.ServeHTTP(w, r)
	})
}
