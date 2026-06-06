package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type Scope string

const (
	ScopeAdmin     Scope = "admin"
	ScopeReadWrite Scope = "read_write"
	ScopeReadOnly  Scope = "read_only"
)

type Authenticator struct {
	adminKey  string
	jwtSecret []byte
}

func New(adminKey string, jwtSecret []byte) *Authenticator {
	return &Authenticator{
		adminKey:  adminKey,
		jwtSecret: jwtSecret,
	}
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

	return true, Scope(scopeStr), db, coll
}

func (a *Authenticator) GenerateKey(scope Scope, database, collection string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":      string(scope),
		"database":   database,
		"collection": collection,
	})
	return token.SignedString(a.jwtSecret)
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
