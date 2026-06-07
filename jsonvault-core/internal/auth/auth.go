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
	ScopeAdmin        Scope = "admin"
	ScopeProjectAdmin Scope = "project_admin"
	ScopeReadWrite    Scope = "read_write"
	ScopeReadOnly     Scope = "read_only"
	maxJWTLifetime          = 90 * 24 * time.Hour
)

type Capability string

const (
	CapabilityMetadataRead      Capability = "metadata:read"
	CapabilityDocumentsRead     Capability = "documents:read"
	CapabilityDocumentsWrite    Capability = "documents:write"
	CapabilityIndexesManage     Capability = "indexes:manage"
	CapabilityFTSManage         Capability = "fts:manage"
	CapabilitySchemasManage     Capability = "schemas:manage"
	CapabilityWebhooksManage    Capability = "webhooks:manage"
	CapabilityCollectionsManage Capability = "collections:manage"
	CapabilityOperationsRead    Capability = "operations:read"
	CapabilityOperationsCancel  Capability = "operations:cancel"
	CapabilityKeysManage        Capability = "keys:manage"
)

type Context struct {
	Scope        Scope
	Database     string
	Collection   string
	TokenID      string
	Capabilities []Capability
}

type Authenticator struct {
	adminKey       string
	jwtSecret      []byte
	revocationPath string
	mu             sync.RWMutex
	revoked        map[string]revokedToken
}

type revokedToken struct {
	ExpiresAt time.Time `json:"expires_at"`
}

type persistedRevocation struct {
	ID        string    `json:"id"`
	ExpiresAt time.Time `json:"expires_at"`
}

type GeneratedKey struct {
	Token        string
	ID           string
	ExpiresAt    time.Time
	Scope        Scope
	Database     string
	Collection   string
	Capabilities []Capability
}

func New(adminKey string, jwtSecret []byte) *Authenticator {
	return &Authenticator{
		adminKey:  adminKey,
		jwtSecret: jwtSecret,
		revoked:   make(map[string]revokedToken),
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
	ctx, ok := a.AuthenticateContext(header)
	if !ok {
		return false, "", "", ""
	}
	return true, ctx.Scope, ctx.Database, ctx.Collection
}

func (a *Authenticator) AuthenticateContext(header string) (Context, bool) {
	scheme, tokenString, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return Context{}, false
	}
	tokenString = strings.TrimSpace(tokenString)
	if tokenString == "" {
		return Context{}, false
	}

	if tokenString == a.adminKey {
		return Context{
			Scope:        ScopeAdmin,
			Database:     "*",
			Collection:   "*",
			TokenID:      "admin",
			Capabilities: DefaultCapabilities(ScopeAdmin),
		}, true
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return Context{}, false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return Context{}, false
	}

	scopeStr, _ := claims["scope"].(string)
	scope := Scope(scopeStr)
	if scope == ScopeAdmin {
		return Context{}, false
	}
	db, _ := claims["database"].(string)
	coll, _ := claims["collection"].(string)
	jti, _ := claims["jti"].(string)
	if jti == "" || a.isRevoked(jti) {
		return Context{}, false
	}
	exp, expOK := claimUnix(claims, "exp")
	iat, iatOK := claimUnix(claims, "iat")
	if !expOK || !iatOK || time.Duration(exp-iat)*time.Second > maxJWTLifetime {
		return Context{}, false
	}

	var capabilities []Capability
	if rawCapabilities, ok := claims["capabilities"]; ok {
		var valid bool
		capabilities, valid = capabilitiesFromClaim(rawCapabilities)
		if !valid {
			return Context{}, false
		}
	} else {
		capabilities = DefaultCapabilities(scope)
	}

	return Context{
		Scope:        scope,
		Database:     db,
		Collection:   coll,
		TokenID:      jti,
		Capabilities: capabilities,
	}, true
}

func (a *Authenticator) GenerateKey(scope Scope, database, collection string) (string, error) {
	key, err := a.GenerateKeyWithMetadata(scope, database, collection)
	if err != nil {
		return "", err
	}
	return key.Token, nil
}

func (a *Authenticator) GenerateKeyWithMetadata(scope Scope, database, collection string) (GeneratedKey, error) {
	return a.GenerateKeyWithMetadataAndCapabilities(scope, database, collection, nil)
}

func (a *Authenticator) GenerateKeyWithMetadataAndCapabilities(scope Scope, database, collection string, capabilities []Capability) (GeneratedKey, error) {
	jti, err := generateTokenID()
	if err != nil {
		return GeneratedKey{}, err
	}
	now := time.Now()
	expiresAt := now.Add(maxJWTLifetime)
	if len(capabilities) == 0 {
		capabilities = DefaultCapabilities(scope)
	}
	claims := jwt.MapClaims{
		"scope":      string(scope),
		"database":   database,
		"collection": collection,
		"iat":        now.Unix(),
		"nbf":        now.Unix(),
		"exp":        expiresAt.Unix(),
		"jti":        jti,
	}
	if len(capabilities) > 0 {
		values := make([]string, 0, len(capabilities))
		for _, capability := range capabilities {
			values = append(values, string(capability))
		}
		claims["capabilities"] = values
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(a.jwtSecret)
	if err != nil {
		return GeneratedKey{}, err
	}
	return GeneratedKey{
		Token:        tokenString,
		ID:           jti,
		ExpiresAt:    expiresAt,
		Scope:        scope,
		Database:     database,
		Collection:   collection,
		Capabilities: capabilities,
	}, nil
}

func (a *Authenticator) RevokeTokenID(jti string) error {
	jti = strings.TrimSpace(jti)
	if jti == "" {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.revoked[jti] = revokedToken{ExpiresAt: time.Now().Add(maxJWTLifetime)}
	return a.persistRevocationsLocked()
}

func (a *Authenticator) isRevoked(jti string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	record, ok := a.revoked[jti]
	if !ok {
		return false
	}
	if !record.ExpiresAt.IsZero() && time.Now().After(record.ExpiresAt) {
		delete(a.revoked, jti)
		return false
	}
	return true
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

	a.mu.Lock()
	defer a.mu.Unlock()

	var records []persistedRevocation
	if err := json.Unmarshal(data, &records); err == nil && len(records) > 0 {
		now := time.Now()
		for _, record := range records {
			id := strings.TrimSpace(record.ID)
			if id != "" && (record.ExpiresAt.IsZero() || now.Before(record.ExpiresAt)) {
				a.revoked[id] = revokedToken{ExpiresAt: record.ExpiresAt}
			}
		}
		return nil
	}

	var ids []string
	if err := json.Unmarshal(data, &ids); err != nil {
		return err
	}
	expiresAt := time.Now().Add(maxJWTLifetime)
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			a.revoked[id] = revokedToken{ExpiresAt: expiresAt}
		}
	}
	return nil
}

func claimUnix(claims jwt.MapClaims, name string) (int64, bool) {
	switch value := claims[name].(type) {
	case float64:
		return int64(value), true
	case int64:
		return value, true
	case json.Number:
		parsed, err := value.Int64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func DefaultCapabilities(scope Scope) []Capability {
	switch scope {
	case ScopeAdmin:
		return AllCapabilities()
	case ScopeProjectAdmin:
		return []Capability{
			CapabilityMetadataRead,
			CapabilityDocumentsRead,
			CapabilityDocumentsWrite,
			CapabilityIndexesManage,
			CapabilityFTSManage,
			CapabilitySchemasManage,
			CapabilityWebhooksManage,
			CapabilityCollectionsManage,
			CapabilityOperationsRead,
			CapabilityOperationsCancel,
			CapabilityKeysManage,
		}
	case ScopeReadWrite:
		return []Capability{CapabilityMetadataRead, CapabilityDocumentsRead, CapabilityDocumentsWrite}
	case ScopeReadOnly:
		return []Capability{CapabilityMetadataRead, CapabilityDocumentsRead}
	default:
		return nil
	}
}

func AllCapabilities() []Capability {
	return []Capability{
		CapabilityMetadataRead,
		CapabilityDocumentsRead,
		CapabilityDocumentsWrite,
		CapabilityIndexesManage,
		CapabilityFTSManage,
		CapabilitySchemasManage,
		CapabilityWebhooksManage,
		CapabilityCollectionsManage,
		CapabilityOperationsRead,
		CapabilityOperationsCancel,
		CapabilityKeysManage,
	}
}

func IsKnownCapability(capability Capability) bool {
	for _, known := range AllCapabilities() {
		if capability == known {
			return true
		}
	}
	return false
}

func NormalizeCapabilities(values []string) ([]Capability, bool) {
	if len(values) == 0 {
		return nil, true
	}
	seen := make(map[Capability]struct{}, len(values))
	capabilities := make([]Capability, 0, len(values))
	for _, value := range values {
		capability := Capability(strings.TrimSpace(value))
		if capability == "" {
			continue
		}
		if !IsKnownCapability(capability) {
			return nil, false
		}
		if _, ok := seen[capability]; ok {
			continue
		}
		seen[capability] = struct{}{}
		capabilities = append(capabilities, capability)
	}
	return capabilities, true
}

func capabilitiesFromClaim(raw any) ([]Capability, bool) {
	switch values := raw.(type) {
	case []string:
		return NormalizeCapabilities(values)
	case []any:
		strings := make([]string, 0, len(values))
		for _, value := range values {
			if str, ok := value.(string); ok {
				strings = append(strings, str)
			} else {
				return nil, false
			}
		}
		return NormalizeCapabilities(strings)
	default:
		return nil, false
	}
}

func (a *Authenticator) persistRevocationsLocked() error {
	if a.revocationPath == "" {
		return nil
	}

	now := time.Now()
	records := make([]persistedRevocation, 0, len(a.revoked))
	for id, record := range a.revoked {
		if !record.ExpiresAt.IsZero() && now.After(record.ExpiresAt) {
			delete(a.revoked, id)
			continue
		}
		records = append(records, persistedRevocation{ID: id, ExpiresAt: record.ExpiresAt})
	}
	sort.Slice(records, func(i, j int) bool {
		return records[i].ID < records[j].ID
	})

	data, err := json.MarshalIndent(records, "", "  ")
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
