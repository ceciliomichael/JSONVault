package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

type CreateKeyRequest struct {
	Scope      string `json:"scope" binding:"required"` // read_write, read_only
	Database   string `json:"database"`                 // Optional: restrict to specific database
	Collection string `json:"collection"`               // Optional: restrict to specific collection
}

// handleCreateKey mints a new JWT API key for a client.
func (s *Server) handleCreateKey(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	if s.authenticator == nil {
		c.AbortWithStatusJSON(http.StatusNotImplemented, gin.H{"error": "authentication is disabled on this server"})
		return
	}

	var req CreateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.Scope != string(auth.ScopeReadWrite) && req.Scope != string(auth.ScopeReadOnly) {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid scope, must be read_write or read_only"})
		return
	}

	dbScope := req.Database
	if dbScope == "" {
		dbScope = "*"
	}
	collScope := req.Collection
	if collScope == "" {
		collScope = "*"
	}

	key, err := s.authenticator.GenerateKeyWithMetadata(auth.Scope(req.Scope), dbScope, collScope)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to generate key"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token":      key.Token,
		"jti":        key.ID,
		"expires_at": key.ExpiresAt.UTC().Format(time.RFC3339),
		"scope":      req.Scope,
		"database":   dbScope,
		"collection": collScope,
	})
}

func (s *Server) handleRevokeKey(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	if s.authenticator == nil {
		c.AbortWithStatusJSON(http.StatusNotImplemented, gin.H{"error": "authentication is disabled on this server"})
		return
	}

	jti := c.Param("jti")
	if jti == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "missing token id"})
		return
	}

	if err := s.authenticator.RevokeTokenID(jti); err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke key"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"revoked": true,
		"jti":     jti,
	})
}
