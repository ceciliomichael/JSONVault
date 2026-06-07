package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

type setWebhooksRequest struct {
	Webhooks []store.WebhookConfig `json:"webhooks"`
}

func (s *Server) handleListWebhookDeliveries(c *gin.Context) {
	database := c.Param("database")
	if !s.hasCapabilityFor(c, auth.CapabilityWebhooksManage, database, "") {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "webhooks:manage capability required"})
		return
	}

	limit := 100
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 1000 {
		limit = 1000
	}

	deliveries, err := s.store.ListWebhookDeliveries(database, c.Query("status"), limit)
	if err != nil {
		s.handleStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deliveries": deliveries})
}

func (s *Server) handleRetryWebhookDelivery(c *gin.Context) {
	database := c.Param("database")
	if !s.hasCapabilityFor(c, auth.CapabilityWebhooksManage, database, "") {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "webhooks:manage capability required"})
		return
	}

	sequence, err := strconv.ParseUint(c.Param("sequence"), 10, 64)
	if err != nil || sequence == 0 {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "invalid webhook delivery sequence"}})
		return
	}
	if err := s.store.RetryWebhookDelivery(database, sequence); err != nil {
		s.handleStoreError(c, err)
		return
	}
	s.audit.append(auditRecord{Actor: tokenID(c), Action: "webhook.retry", Database: database, Target: c.Param("sequence"), Status: "ready"})
	c.JSON(http.StatusOK, gin.H{"retry": true, "sequence": sequence})
}

func (s *Server) handleSetWebhooks(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityWebhooksManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "webhooks:manage capability required"})
		return
	}

	var req setWebhooksRequest
	if !s.bindJSON(c, &req) {
		return
	}

	secret, err := s.store.SetWebhooks(database, collection, req.Webhooks)
	if err != nil {
		s.handleStoreError(c, err)
		return
	}
	s.audit.append(auditRecord{Actor: tokenID(c), Action: "webhook.set", Database: database, Collection: collection, Status: "ready"})

	c.JSON(http.StatusOK, gin.H{
		"updated":        true,
		"webhook_secret": secret,
	})
}

func (s *Server) handleGetWebhooks(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityWebhooksManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "webhooks:manage capability required"})
		return
	}

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
