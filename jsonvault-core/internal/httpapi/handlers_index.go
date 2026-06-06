package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

type createIndexRequest struct {
	Field string `json:"field" binding:"required"`
}

func (s *Server) handleListIndexes(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadOnly) && !s.hasScope(c, auth.ScopeReadWrite) && !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	indexes, err := s.store.ListIndexes(database, collection)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			indexes = []string{}
		} else {
			s.handleStoreError(c, err)
			return
		}
	}

	c.JSON(http.StatusOK, map[string]any{"indexes": indexes})
}

func (s *Server) handleCreateIndex(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadWrite) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "read_write scope required to create indexes"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	var req createIndexRequest
	if !s.bindJSON(c, &req) {
		return
	}

	if err := s.store.CreateIndex(c.Request.Context(), database, collection, req.Field); err != nil {
		s.handleStoreError(c, err)
		return
	}

	c.JSON(http.StatusCreated, map[string]any{"indexed": true, "field": req.Field})
}

func (s *Server) handleDeleteIndex(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadWrite) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "read_write scope required to delete indexes"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")
	field := c.Param("field")

	if err := s.store.DeleteIndex(database, collection, field); err != nil {
		s.handleStoreError(c, err)
		return
	}

	c.JSON(http.StatusOK, map[string]any{"deleted": true, "field": field})
}
