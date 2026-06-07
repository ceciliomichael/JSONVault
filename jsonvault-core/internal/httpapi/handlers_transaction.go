package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

type transactionRequest struct {
	Operations []store.TransactionOp `json:"operations"`
}

func (s *Server) handleTransaction(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeReadWrite) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "read_write scope required for transactions"})
		return
	}

	database := c.Param("database")

	var req transactionRequest
	if !s.bindJSON(c, &req) {
		return
	}

	if len(req.Operations) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "transaction must contain at least one operation"}})
		return
	}
	if len(req.Operations) > store.MaxTransactionOps {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "transaction has too many operations"}})
		return
	}
	var totalBytes int
	for _, op := range req.Operations {
		totalBytes += len(op.Body)
		if totalBytes > store.MaxTransactionBytes {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "transaction payload too large"}})
			return
		}
	}

	// For security, verify the user's JWT has access to every single collection they are trying to modify.
	for _, op := range req.Operations {
		// Temporarily fake the collection param to use hasScope natively
		c.Params = append(c.Params, gin.Param{Key: "collection", Value: op.Collection})
		hasAccess := s.hasScope(c, auth.ScopeReadWrite)
		// Clean up the fake param
		c.Params = c.Params[:len(c.Params)-1]

		if !hasAccess {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "forbidden",
					"message": "insufficient permissions for collection: " + op.Collection,
				},
			})
			return
		}
	}

	results, err := s.store.ExecuteTransaction(database, req.Operations)
	if err != nil {
		s.handleStoreError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}
