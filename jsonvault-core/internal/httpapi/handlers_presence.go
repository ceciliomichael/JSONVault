package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

type HeartbeatRequest struct {
	ClientID string          `json:"client_id"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

type LeavePresenceRequest struct {
	ClientID string `json:"client_id"`
}

func (s *Server) handleHeartbeat(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadOnly) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	var req HeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json body"})
		return
	}

	if req.ClientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id is required"})
		return
	}
	if len(req.ClientID) > 128 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id exceeds 128 characters"})
		return
	}

	isNew, err := s.store.Heartbeat(database, collection, req.ClientID, req.Metadata, 30*time.Second)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if isNew {
		docJSON, _ := json.Marshal(map[string]any{
			"client_id": req.ClientID,
			"metadata":  req.Metadata,
		})
		s.store.PublishEvent(store.Event{
			Action:     "presence_join",
			Database:   database,
			Collection: collection,
			DocumentID: req.ClientID,
			Document:   docJSON,
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleLeavePresence(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadOnly) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	var req LeavePresenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json body"})
		return
	}

	if req.ClientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id is required"})
		return
	}

	found := s.store.LeavePresence(database, collection, req.ClientID)
	if found {
		docJSON, _ := json.Marshal(map[string]any{
			"client_id": req.ClientID,
		})
		s.store.PublishEvent(store.Event{
			Action:     "presence_leave",
			Database:   database,
			Collection: collection,
			DocumentID: req.ClientID,
			Document:   docJSON,
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handlePresence(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadOnly) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	clients := s.store.ListPresence(database, collection)
	if clients == nil {
		clients = []store.PresenceEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"database":   database,
		"collection": collection,
		"count":      len(clients),
		"clients":    clients,
	})
}
