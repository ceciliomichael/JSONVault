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

	result, err := s.store.Heartbeat(database, collection, req.ClientID, req.Metadata, 30*time.Second)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	switch {
	case result.Joined:
		s.store.PublishEvent(store.NewPresenceEvent("presence_join", database, collection, result.Entry))
	case result.Updated:
		s.store.PublishEvent(store.NewPresenceEvent("presence_update", database, collection, result.Entry))
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":         true,
		"joined":     result.Joined,
		"updated":    result.Updated,
		"expires_at": result.Entry.ExpiresAt,
	})
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

	entry, found := s.store.LeavePresence(database, collection, req.ClientID)
	if found {
		s.store.PublishEvent(store.NewPresenceEvent("presence_leave", database, collection, entry))
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "left": found})
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
		"state":      presenceState(clients),
	})
}

func presenceState(clients []store.PresenceEntry) map[string][]store.PresenceEntry {
	state := make(map[string][]store.PresenceEntry, len(clients))
	for _, client := range clients {
		state[client.ClientID] = append(state[client.ClientID], client)
	}
	return state
}
