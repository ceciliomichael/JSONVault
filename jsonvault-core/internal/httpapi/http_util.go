package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	
	"jsonvault/internal/store"
)

type createNameRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleStoreError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "resource not found"}})
	case errors.Is(err, store.ErrInvalidName), errors.Is(err, store.ErrReservedName):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_name", "message": err.Error()}})
	case errors.Is(err, store.ErrInvalidJSON), errors.Is(err, store.ErrEmptyDocument):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_json", "message": "request body must be a non-empty valid JSON value"}})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "internal server error"}})
	}
}
