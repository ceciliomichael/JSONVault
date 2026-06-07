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

const maxManagedIndexesPerCollection = 16

func (s *Server) handleListIndexes(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityMetadataRead, database, collection) &&
		!s.hasCapabilityFor(c, auth.CapabilityDocumentsRead, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	indexes, err := s.store.ListIndexes(database, collection)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			indexes = []string{}
		} else {
			s.handleStoreError(c, err)
			return
		}
	}

	if c.Query("details") == "true" {
		type indexInfo struct {
			Field string `json:"field"`
			State string `json:"state"`
		}
		details := make([]indexInfo, 0, len(indexes))
		for _, field := range indexes {
			details = append(details, indexInfo{Field: field, State: "ready"})
		}
		c.JSON(http.StatusOK, map[string]any{"indexes": details})
		return
	}
	c.JSON(http.StatusOK, map[string]any{"indexes": indexes})
}

func (s *Server) handleCreateIndex(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityIndexesManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "indexes:manage capability required"})
		return
	}

	var req createIndexRequest
	if !s.bindJSON(c, &req) {
		return
	}

	indexes, err := s.store.ListIndexes(database, collection)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		s.handleStoreError(c, err)
		return
	}
	for _, existing := range indexes {
		if existing == req.Field {
			c.JSON(http.StatusOK, map[string]any{"indexed": true, "field": req.Field, "state": "ready"})
			return
		}
	}
	if len(indexes) >= maxManagedIndexesPerCollection {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{"code": "quota_exceeded", "message": "maximum indexes per collection exceeded"}})
		return
	}

	if c.Query("async") == "true" {
		actor := tokenID(c)
		operation, opCtx := s.operations.start("index.create", database, collection, req.Field, actor, true)
		s.audit.append(auditRecord{Actor: actor, Action: "index.create", Database: database, Collection: collection, Target: req.Field, Status: "queued"})
		go func() {
			s.operations.markRunning(operation.ID)
			err := s.store.CreateIndex(opCtx, database, collection, req.Field)
			s.operations.finish(operation.ID, err)
			status := "ready"
			errText := ""
			if err != nil {
				status = "failed"
				errText = err.Error()
			}
			s.audit.append(auditRecord{Actor: actor, Action: "index.create", Database: database, Collection: collection, Target: req.Field, Status: status, Error: errText})
		}()
		c.JSON(http.StatusAccepted, operation)
		return
	}

	actor := tokenID(c)
	operation, _ := s.operations.start("index.create", database, collection, req.Field, actor, false)
	s.operations.markRunning(operation.ID)
	if err := s.store.CreateIndex(c.Request.Context(), database, collection, req.Field); err != nil {
		s.operations.finish(operation.ID, err)
		s.audit.append(auditRecord{Actor: actor, Action: "index.create", Database: database, Collection: collection, Target: req.Field, Status: "failed", Error: err.Error()})
		s.handleStoreError(c, err)
		return
	}
	s.operations.finish(operation.ID, nil)
	s.audit.append(auditRecord{Actor: actor, Action: "index.create", Database: database, Collection: collection, Target: req.Field, Status: "ready"})

	c.JSON(http.StatusCreated, map[string]any{"indexed": true, "field": req.Field, "operation_id": operation.ID, "state": "ready"})
}

func (s *Server) handleDeleteIndex(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	field := c.Param("field")
	if !s.hasCapabilityFor(c, auth.CapabilityIndexesManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "indexes:manage capability required"})
		return
	}

	if err := s.store.DeleteIndex(database, collection, field); err != nil {
		s.handleStoreError(c, err)
		return
	}
	s.audit.append(auditRecord{Actor: tokenID(c), Action: "index.delete", Database: database, Collection: collection, Target: field, Status: "ready"})

	c.JSON(http.StatusOK, map[string]any{"deleted": true, "field": field})
}
