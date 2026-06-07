package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

func (s *Server) handleMe(c *gin.Context) {
	scopeRaw, _ := c.Get("scope")
	scope, _ := scopeRaw.(auth.Scope)
	dbRaw, _ := c.Get("jwt_db")
	collRaw, _ := c.Get("jwt_coll")
	db, _ := dbRaw.(string)
	coll, _ := collRaw.(string)

	capabilities := []string{}
	if raw, ok := c.Get("capabilities"); ok {
		if values, ok := raw.([]auth.Capability); ok {
			for _, capability := range values {
				capabilities = append(capabilities, string(capability))
			}
		}
	}
	if scope == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "unauthorized", "message": "missing auth context"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"scope":        scope,
		"database":     db,
		"collection":   coll,
		"token_id":     tokenID(c),
		"capabilities": capabilities,
	})
}
