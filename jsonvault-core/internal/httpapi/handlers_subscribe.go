package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
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
	c.Writer.Flush()

	sub := s.store.Subscribe(database, collection)
	defer s.store.Unsubscribe(sub)

	// Keep-Alive Ticker: Prevents reverse proxies (Nginx/Cloudflare) from severing idle streams.
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	ctx := c.Request.Context()

	for {
		select {
		case <-ctx.Done():
			// Client disconnected gracefully or abruptly
			return

		case <-ticker.C:
			// Send a lightweight SSE comment to trick proxies into keeping the socket alive
			fmt.Fprintf(c.Writer, ": keepalive\n\n")
			c.Writer.Flush()

		case event := <-sub.Ch:
			// Format the event as a standard JSON string payload
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			
			// SSE format requires `data: <content>\n\n`
			fmt.Fprintf(c.Writer, "data: %s\n\n", string(data))
			c.Writer.Flush()
		}
	}
}
