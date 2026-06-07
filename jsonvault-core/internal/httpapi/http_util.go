package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"jsonvault/internal/store"
)

const statusClientClosedRequest = 499

type createNameRequest struct {
	Name string `json:"name"`
}

func (s *Server) bindJSON(c *gin.Context, out any) bool {
	if err := c.ShouldBindJSON(out); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": gin.H{"code": "payload_too_large", "message": "request body exceeds maximum size"}})
			return false
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "request body must be valid JSON"}})
		return false
	}
	return true
}

func (s *Server) handleStoreError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, context.Canceled):
		c.JSON(statusClientClosedRequest, gin.H{"error": gin.H{"code": "request_cancelled", "message": "request was cancelled"}})
	case errors.Is(err, context.DeadlineExceeded):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": gin.H{"code": "request_timeout", "message": "request timed out"}})
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "resource not found"}})
	case errors.Is(err, store.ErrInvalidName), errors.Is(err, store.ErrReservedName):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_name", "message": err.Error()}})
	case errors.Is(err, store.ErrInvalidJSON), errors.Is(err, store.ErrEmptyDocument):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_json", "message": "request body must be a non-empty valid JSON value"}})
	case errors.Is(err, store.ErrSchemaValidation):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "schema_validation_failed", "message": err.Error()}})
	case errors.Is(err, store.ErrPreconditionFailed):
		c.JSON(http.StatusPreconditionFailed, gin.H{"error": gin.H{"code": "precondition_failed", "message": err.Error()}})
	default:
		slog.Error("store request failed",
			"method", c.Request.Method,
			"path", c.FullPath(),
			"database", c.Param("database"),
			"collection", c.Param("collection"),
			"error", err,
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "internal server error"}})
	}
}
