package httpapi

import (
	"net/http"
	
	"github.com/gin-gonic/gin"
)

func (s *Server) handleCollections(c *gin.Context) {
	database := c.Param("database")
	switch c.Request.Method {
	case http.MethodGet:
		collections, err := s.store.ListCollections(database)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, collections)
	case http.MethodPost:
		var req createNameRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "request body must be valid JSON"}})
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
