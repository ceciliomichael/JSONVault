package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

type setWebhooksRequest struct {
	Webhooks []store.WebhookConfig `json:"webhooks"`
}

func (s *Server) handleSetWebhooks(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin scope required to manage webhooks"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	var req setWebhooksRequest
	if !s.bindJSON(c, &req) {
		return
	}

	secret, err := s.store.SetWebhooks(database, collection, req.Webhooks)
	if err != nil {
		s.handleStoreError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"updated":        true,
		"webhook_secret": secret,
	})
}

func (s *Server) handleGetWebhooks(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin scope required to view webhooks"})
		return
	}

	database := c.Param("database")
	collection := c.Param("collection")

	record, err := s.store.GetWebhooks(database, collection)
	if err != nil {
		s.handleStoreError(c, err)
		return
	}

	if record == nil {
		c.JSON(http.StatusOK, gin.H{
			"webhooks": []store.WebhookConfig{},
		})
		return
	}

	// We ONLY return the webhooks, NOT the secret. The secret is only returned ONCE upon setting.
	c.JSON(http.StatusOK, gin.H{
		"webhooks": record.Webhooks,
	})
}
