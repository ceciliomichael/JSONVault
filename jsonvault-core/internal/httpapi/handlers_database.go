package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

func (s *Server) handleDatabases(c *gin.Context) {
	switch c.Request.Method {
	case http.MethodGet:
		if !contextHasCapability(c, auth.CapabilityMetadataRead) && !contextHasCapability(c, auth.CapabilityDocumentsRead) && !s.hasScope(c, auth.ScopeAdmin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if dbConstraint, _ := c.Get("jwt_db"); dbConstraint != "*" {
			if db, ok := dbConstraint.(string); ok && db != "" {
				c.JSON(http.StatusOK, []string{db})
				return
			}
		}
		databases, err := s.store.ListDatabases()
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, databases)
	case http.MethodPost:
		if !s.hasScope(c, auth.ScopeAdmin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		var req createNameRequest
		if !s.bindJSON(c, &req) {
			return
		}
		created, err := s.store.CreateDatabase(req.Name)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		c.JSON(status, gin.H{
			"name":    req.Name,
			"created": created,
		})
	default:
		c.AbortWithStatus(http.StatusMethodNotAllowed)
	}
}
