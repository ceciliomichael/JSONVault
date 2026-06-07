package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

type CreateKeyRequest struct {
	Scope        string   `json:"scope" binding:"required"`
	Database     string   `json:"database"`
	Collection   string   `json:"collection"`
	Capabilities []string `json:"capabilities"`
}

// handleCreateKey mints a new JWT API key for a client.
func (s *Server) handleCreateKey(c *gin.Context) {
	isAdmin := s.hasScope(c, auth.ScopeAdmin)
	canManageKeys := isAdmin || contextHasCapability(c, auth.CapabilityKeysManage)
	if !isAdmin && !canManageKeys {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin scope or keys:manage capability required"})
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

	scope := auth.Scope(req.Scope)
	if scope != auth.ScopeReadWrite && scope != auth.ScopeReadOnly && scope != auth.ScopeProjectAdmin {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid scope, must be read_write, read_only, or project_admin"})
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
	if !isAdmin {
		if scope == auth.ScopeProjectAdmin || len(req.Capabilities) > 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "project key managers can only mint read_only or read_write runtime keys"})
			return
		}
		if !tokenAllowsResource(c, dbScope, collScope) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "requested key is outside caller constraints"})
			return
		}
	}
	if scope == auth.ScopeProjectAdmin && dbScope == "*" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "project_admin keys must be constrained to one database"})
		return
	}

	capabilities, ok := auth.NormalizeCapabilities(req.Capabilities)
	if !ok {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid capability"})
		return
	}

	key, err := s.authenticator.GenerateKeyWithMetadataAndCapabilities(scope, dbScope, collScope, capabilities)
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
		"capabilities": func() []string {
			values := make([]string, 0, len(key.Capabilities))
			for _, capability := range key.Capabilities {
				values = append(values, string(capability))
			}
			return values
		}(),
	})
	s.audit.append(auditRecord{Actor: tokenID(c), Action: "key.create", Database: dbScope, Collection: collScope, Target: key.ID, Status: "ready"})
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
