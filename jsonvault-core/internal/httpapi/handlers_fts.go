package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

type setFTSRequest struct {
	Fields []string `json:"fields"`
}

const maxManagedFTSFields = 16

func (s *Server) handleGetFTSConfig(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityMetadataRead, database, collection) &&
		!s.hasCapabilityFor(c, auth.CapabilityDocumentsRead, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	config, found, err := s.store.GetFTSConfig(database, collection)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			c.JSON(http.StatusOK, gin.H{"configured": false, "fields": []string{}, "state": "none"})
			return
		}
		s.handleStoreError(c, err)
		return
	}
	if !found {
		c.JSON(http.StatusOK, gin.H{"configured": false, "fields": []string{}, "state": "none"})
		return
	}
	fields := config.Fields
	if fields == nil {
		fields = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"configured": true, "fields": fields, "state": "ready"})
}

func (s *Server) handleSetFTSConfig(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityFTSManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "fts:manage capability required"})
		return
	}

	var req setFTSRequest
	if !s.bindJSON(c, &req) {
		return
	}

	if len(req.Fields) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one field is required for FTS"})
		return
	}
	if len(req.Fields) > maxManagedFTSFields {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{"code": "quota_exceeded", "message": "maximum FTS fields per collection exceeded"}})
		return
	}

	if c.Query("async") == "true" {
		actor := tokenID(c)
		operation, _ := s.operations.start("fts.configure", database, collection, "", actor, false)
		s.audit.append(auditRecord{Actor: actor, Action: "fts.configure", Database: database, Collection: collection, Status: "queued"})
		fields := append([]string(nil), req.Fields...)
		go func() {
			s.operations.markRunning(operation.ID)
			err := s.store.SetFTSConfig(database, collection, fields)
			s.operations.finish(operation.ID, err)
			status := "ready"
			errText := ""
			if err != nil {
				status = "failed"
				errText = err.Error()
			}
			s.audit.append(auditRecord{Actor: actor, Action: "fts.configure", Database: database, Collection: collection, Status: status, Error: errText})
		}()
		c.JSON(http.StatusAccepted, operation)
		return
	}

	actor := tokenID(c)
	operation, _ := s.operations.start("fts.configure", database, collection, "", actor, false)
	s.operations.markRunning(operation.ID)
	if err := s.store.SetFTSConfig(database, collection, req.Fields); err != nil {
		s.operations.finish(operation.ID, err)
		s.audit.append(auditRecord{Actor: actor, Action: "fts.configure", Database: database, Collection: collection, Status: "failed", Error: err.Error()})
		s.handleStoreError(c, err)
		return
	}
	s.operations.finish(operation.ID, nil)
	s.audit.append(auditRecord{Actor: actor, Action: "fts.configure", Database: database, Collection: collection, Status: "ready"})

	c.JSON(http.StatusOK, gin.H{
		"updated":      true,
		"fts":          req.Fields,
		"operation_id": operation.ID,
		"state":        "ready",
	})
}
