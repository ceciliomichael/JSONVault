package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

func (s *Server) handleCollections(c *gin.Context) {
	database := c.Param("database")
	switch c.Request.Method {
	case http.MethodGet:
		if !s.hasScope(c, auth.ScopeReadOnly) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		collections, err := s.store.ListCollections(database)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, collections)
	case http.MethodPost:
		if !s.hasScope(c, auth.ScopeAdmin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		var req createNameRequest
		if !s.bindJSON(c, &req) {
			return
		}
		created, err := s.store.CreateCollection(database, req.Name)
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
