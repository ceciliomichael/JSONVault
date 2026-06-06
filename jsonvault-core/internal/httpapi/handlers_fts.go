package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

type setFTSRequest struct {
	Fields []string `json:"fields"`
}

func (s *Server) handleSetFTSConfig(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadWrite) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "read_write scope required to manage fts"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	var req setFTSRequest
	if !s.bindJSON(c, &req) {
		return
	}

	if len(req.Fields) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one field is required for FTS"})
		return
	}

	if err := s.store.SetFTSConfig(database, collection, req.Fields); err != nil {
		s.handleStoreError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"updated": true,
		"fts":     req.Fields,
	})
}
