package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

func (s *Server) handleSubscribe(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadOnly) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	// Disable global WriteTimeout for this specific long-lived connection.
	// This prevents the server from forcefully dropping subscriptions every 30 seconds.
	rc := http.NewResponseController(c.Writer)
	_ = rc.SetWriteDeadline(time.Time{})

	// Standard Server-Sent Events headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	// Flush headers immediately to establish the stream with the client
	if err := rc.Flush(); err != nil {
		return
	}

	sub := s.store.Subscribe(database, collection)
	defer s.store.Unsubscribe(sub)

	lastSent := parseLastEventID(c)
	if lastSent > 0 {
		events, err := s.store.ReplayEvents(database, collection, lastSent, 1000)
		if err != nil {
			return
		}
		for _, event := range events {
			if !writeSSEEvent(c, rc, event) {
				return
			}
			if event.Sequence > lastSent {
				lastSent = event.Sequence
			}
		}
	}

	if !writeSSEEvent(c, rc, s.presenceStateEvent(database, collection)) {
		return
	}

	// Keep-Alive Ticker: Prevents reverse proxies (Nginx/Cloudflare) from severing idle streams.
	keepalive := time.NewTicker(5 * time.Second)
	defer keepalive.Stop()

	ctx := c.Request.Context()

	for {
		select {
		case <-ctx.Done():
			// Client disconnected gracefully or abruptly
			return

		case <-keepalive.C:
			// Send a lightweight SSE comment to trick proxies into keeping the socket alive
			if _, err := fmt.Fprintf(c.Writer, ": keepalive\n\n"); err != nil {
				return
			}
			if err := rc.Flush(); err != nil {
				return
			}

		case event, ok := <-sub.Ch:
			if !ok {
				return
			}
			if event.Sequence > 0 && event.Sequence <= lastSent {
				continue
			}
			if !writeSSEEvent(c, rc, event) {
				return
			}
			if event.Sequence > lastSent {
				lastSent = event.Sequence
			}
		}
	}
}

func parseLastEventID(c *gin.Context) uint64 {
	raw := c.GetHeader("Last-Event-ID")
	if raw == "" {
		raw = c.Query("last_event_id")
	}
	if raw == "" {
		return 0
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0
	}
	return value
}

func writeSSEEvent(c *gin.Context, rc *http.ResponseController, event store.Event) bool {
	data, err := json.Marshal(event)
	if err != nil {
		return true
	}
	if _, err := fmt.Fprintf(c.Writer, "data: %s\n", string(data)); err != nil {
		return false
	}
	if event.Sequence > 0 {
		if _, err := fmt.Fprintf(c.Writer, "id: %d\n", event.Sequence); err != nil {
			return false
		}
	}
	if _, err := fmt.Fprintf(c.Writer, "\n"); err != nil {
		return false
	}
	return rc.Flush() == nil
}

func (s *Server) presenceStateEvent(database, collection string) store.Event {
	clients := s.store.ListPresence(database, collection)
	if clients == nil {
		clients = []store.PresenceEntry{}
	}
	document, _ := json.Marshal(gin.H{
		"database":   database,
		"collection": collection,
		"count":      len(clients),
		"clients":    clients,
		"state":      presenceState(clients),
	})
	return store.Event{
		Action:     "presence_state",
		Database:   database,
		Collection: collection,
		DocumentID: "presence",
		Document:   document,
	}
}

func (s *Server) handlePublish(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadWrite) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	body, err := c.GetRawData()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	if len(body) > 102400 { // 100KB payload limit to prevent memory abuse on transient streams
		c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": "payload too large for transient pub/sub (max 100KB)"})
		return
	}
	if !json.Valid(body) {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "publish payload must be valid JSON"}})
		return
	}

	s.store.PublishEvent(store.Event{
		Action:     "publish",
		Database:   database,
		Collection: collection,
		Document:   json.RawMessage(body),
	})
	c.JSON(http.StatusAccepted, gin.H{"published": true, "database": database, "collection": collection})
}
