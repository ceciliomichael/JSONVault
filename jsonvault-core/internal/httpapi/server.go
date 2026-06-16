package httpapi

import (
	"context"
	stdjson "encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"jsonvault/internal/auth"
	"jsonvault/internal/store"
	"time"
)

const defaultMaxBodyBytes int64 = 10 * 1024 * 1024

type Store interface {
	CreateDatabase(name string) (bool, error)
	ListDatabases() ([]string, error)
	DeleteDatabase(name string) error
	CreateCollection(database, collection string) (bool, error)
	ListCollections(database string) ([]string, error)
	DeleteCollection(database, collection string) error

	SetSchema(database, collection string, schema []byte) error
	GetSchema(database, collection string) ([]byte, error)

	SetFTSConfig(database, collection string, fields []string) error
	GetFTSConfig(database, collection string) (store.FTSConfig, bool, error)
	SearchFTS(database, collection, query string) ([]string, error)

	SetWebhooks(database, collection string, webhooks []store.WebhookConfig) (string, error)
	GetWebhooks(database, collection string) (*store.WebhookRecord, error)
	ListWebhookDeliveries(database, status string, limit int) ([]store.WebhookDelivery, error)
	RetryWebhookDelivery(database string, sequence uint64) error

	CreateDocument(database, collection string, body []byte) (store.Document, error)
	CreateDocumentWithTTL(database, collection string, body []byte, expireIn time.Duration) (store.Document, error)
	ListDocuments(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}, sortField string, searchQuery string) ([]store.Document, int, error)
	ListDocumentsDetailed(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}, sortField string, searchQuery string) (store.ListResult, error)
	GetDocument(database, collection, id string) (store.Document, error)
	PutDocument(database, collection, id string, body []byte, expectedETag string) (store.Document, error)
	PutDocumentWithTTL(database, collection, id string, body []byte, expectedETag string, expireIn time.Duration) (store.Document, error)
	PatchDocument(database, collection, id string, body []byte, expectedETag string) (store.Document, error)
	DeleteDocument(database, collection, id string, expectedETag string) error

	ExecuteTransaction(database string, ops []store.TransactionOp) ([]store.Document, error)
	Stats() store.Stats

	ListIndexes(database, collection string) ([]string, error)
	CreateIndex(ctx context.Context, database, collection, field string) error
	DeleteIndex(database, collection, field string) error

	BackupDatabase(ctx context.Context, database string, w io.Writer) error

	Subscribe(database, collection string) *store.Subscription
	Unsubscribe(sub *store.Subscription)
	ReplayEvents(database, collection string, after uint64, limit int) ([]store.Event, error)
	PublishEvent(event store.Event)
	GetSubscriberCount(database, collection string) int

	Heartbeat(database, collection, clientID string, metadata stdjson.RawMessage, ttl time.Duration) (store.PresenceHeartbeatResult, error)
	LeavePresence(database, collection, clientID string) (store.PresenceEntry, bool)
	ListPresence(database, collection string) []store.PresenceEntry
}

type Options struct {
	MaxBodyBytes   int64
	AdminRateLimit int
}

type Server struct {
	store         Store
	authenticator *auth.Authenticator
	maxBodyBytes  int64
	rateLimiter   *rateLimiter
	operations    *operationTracker
	audit         *auditLog
}

func NewHandler(db Store, authenticator *auth.Authenticator, options Options) http.Handler {
	maxBodyBytes := options.MaxBodyBytes
	if maxBodyBytes < 1 {
		maxBodyBytes = defaultMaxBodyBytes
	}
	adminRateLimit := options.AdminRateLimit
	if adminRateLimit < 1 {
		adminRateLimit = 120
	}

	server := &Server{
		store:         db,
		authenticator: authenticator,
		maxBodyBytes:  maxBodyBytes,
		rateLimiter:   newRateLimiter(adminRateLimit, time.Minute),
		operations:    newOperationTracker(),
		audit:         newAuditLog(),
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(MetricsMiddleware())
	r.Use(maxBodyBytesMiddleware(maxBodyBytes))

	if authenticator == nil {
		panic("NewHandler requires a non-nil authenticator. For testing, use NewUnauthenticatedHandler.")
	}

	r.Use(func(c *gin.Context) {
		if c.Request.URL.Path == "/healthz" {
			c.Next()
			return
		}
		authCtx, ok := authenticator.AuthenticateContext(c.GetHeader("Authorization"))
		if !ok {
			c.Header("WWW-Authenticate", `Bearer realm="jsonvault"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, map[string]any{
				"error": map[string]string{
					"code":    "unauthorized",
					"message": "missing or invalid bearer token",
				},
			})
			return
		}
		c.Set("scope", authCtx.Scope)
		c.Set("jwt_db", authCtx.Database)
		c.Set("jwt_coll", authCtx.Collection)
		c.Set("token_id", authCtx.TokenID)
		c.Set("capabilities", authCtx.Capabilities)
		c.Next()
	})

	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "no-store")
		c.Next()
	})

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	r.GET("/metrics", server.handleMetrics)

	v1 := r.Group("/api/v1")
	{
		v1.GET("/me", server.handleMe)
		v1.GET("/operations", server.handleListOperations)
		v1.GET("/operations/:operation_id", server.handleGetOperation)
		v1.POST("/operations/:operation_id/cancel", server.rateLimitOperational(), server.handleCancelOperation)
		v1.GET("/audit", server.handleListAudit)

		v1.GET("/admin/keys", func(c *gin.Context) {
			c.AbortWithStatusJSON(http.StatusMethodNotAllowed, gin.H{"error": "use POST to generate keys"})
		})
		v1.POST("/admin/keys", server.rateLimitOperational(), server.handleCreateKey)
		v1.DELETE("/admin/keys/:jti", server.rateLimitOperational(), server.handleRevokeKey)

		v1.GET("/admin/backup/:database", server.rateLimitOperational(), server.handleBackupDatabase)
		v1.GET("/admin/webhooks/:database/deliveries", server.rateLimitOperational(), server.handleListWebhookDeliveries)
		v1.POST("/admin/webhooks/:database/deliveries/:sequence/retry", server.rateLimitOperational(), server.handleRetryWebhookDelivery)

		v1.GET("/databases", server.handleDatabases)
		v1.POST("/databases", server.rateLimitOperational(), server.handleDatabases)
		v1.DELETE("/:database", server.rateLimitOperational(), server.handleDeleteDatabase)

		v1.GET("/:database/collections", server.handleCollections)
		v1.POST("/:database/collections", server.rateLimitOperational(), server.handleCollections)
		v1.DELETE("/:database/collections/:collection", server.rateLimitOperational(), server.handleDeleteCollection)

		v1.POST("/:database/transactions", server.rateLimitOperational(), server.handleTransaction)

		v1.GET("/:database/:collection", server.handleCollectionDocuments)
		v1.POST("/:database/:collection", server.handleCollectionDocuments)

		v1.GET("/:database/:collection/indexes", server.handleListIndexes)
		v1.POST("/:database/:collection/indexes", server.rateLimitOperational(), server.handleCreateIndex)
		v1.DELETE("/:database/:collection/indexes/:field", server.rateLimitOperational(), server.handleDeleteIndex)

		v1.GET("/:database/:collection/fts", server.handleGetFTSConfig)
		v1.POST("/:database/:collection/fts", server.rateLimitOperational(), server.handleSetFTSConfig)

		v1.GET("/:database/:collection/schema", server.handleGetSchema)
		v1.POST("/:database/:collection/schema/validate", server.rateLimitOperational(), server.handleValidateSchema)
		v1.PUT("/:database/:collection/schema", server.rateLimitOperational(), server.handleSetSchema)
		v1.DELETE("/:database/:collection/schema", server.rateLimitOperational(), server.handleSetSchema)

		v1.GET("/:database/:collection/webhooks", server.handleGetWebhooks)
		v1.PUT("/:database/:collection/webhooks", server.rateLimitOperational(), server.handleSetWebhooks)

		v1.GET("/:database/:collection/subscribe", server.handleSubscribe)
		v1.POST("/:database/:collection/publish", server.handlePublish)
		v1.POST("/:database/:collection/heartbeat", server.handleHeartbeat)
		v1.DELETE("/:database/:collection/heartbeat", server.handleLeavePresence)
		v1.GET("/:database/:collection/presence", server.handlePresence)

		v1.GET("/:database/:collection/:id", server.handleDocumentByID)
		v1.PUT("/:database/:collection/:id", server.handleDocumentByID)
		v1.PATCH("/:database/:collection/:id", server.handleDocumentByID)
		v1.DELETE("/:database/:collection/:id", server.handleDocumentByID)
	}

	return r
}

// NewUnauthenticatedHandler is for internal tests only. It bypasses auth entirely.
func NewUnauthenticatedHandler(db Store, options Options) http.Handler {
	maxBodyBytes := options.MaxBodyBytes
	if maxBodyBytes < 1 {
		maxBodyBytes = defaultMaxBodyBytes
	}

	server := &Server{
		store:         db,
		authenticator: nil,
		maxBodyBytes:  maxBodyBytes,
		operations:    newOperationTracker(),
		audit:         newAuditLog(),
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(maxBodyBytesMiddleware(maxBodyBytes))

	r.Use(func(c *gin.Context) {
		// Mock admin scope for tests if no auth
		c.Set("scope", auth.ScopeAdmin)
		c.Set("jwt_db", "*")
		c.Set("jwt_coll", "*")
		c.Set("token_id", "test-admin")
		c.Set("capabilities", auth.DefaultCapabilities(auth.ScopeAdmin))
		c.Next()
	})

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	v1 := r.Group("/api/v1")
	{
		v1.GET("/me", server.handleMe)
		v1.GET("/operations", server.handleListOperations)
		v1.GET("/operations/:operation_id", server.handleGetOperation)
		v1.POST("/operations/:operation_id/cancel", server.handleCancelOperation)
		v1.GET("/audit", server.handleListAudit)

		v1.GET("/admin/keys", func(c *gin.Context) {
			c.AbortWithStatusJSON(http.StatusMethodNotAllowed, gin.H{"error": "use POST to generate keys"})
		})
		v1.POST("/admin/keys", server.handleCreateKey)
		v1.DELETE("/admin/keys/:jti", server.handleRevokeKey)
		v1.GET("/admin/webhooks/:database/deliveries", server.handleListWebhookDeliveries)
		v1.POST("/admin/webhooks/:database/deliveries/:sequence/retry", server.handleRetryWebhookDelivery)

		v1.GET("/databases", server.handleDatabases)
		v1.POST("/databases", server.handleDatabases)
		v1.DELETE("/:database", server.handleDeleteDatabase)

		v1.GET("/:database/collections", server.handleCollections)
		v1.POST("/:database/collections", server.handleCollections)
		v1.DELETE("/:database/collections/:collection", server.handleDeleteCollection)

		v1.POST("/:database/transactions", server.handleTransaction)

		v1.GET("/:database/:collection", server.handleCollectionDocuments)
		v1.POST("/:database/:collection", server.handleCollectionDocuments)

		v1.GET("/:database/:collection/indexes", server.handleListIndexes)
		v1.POST("/:database/:collection/indexes", server.handleCreateIndex)
		v1.DELETE("/:database/:collection/indexes/:field", server.handleDeleteIndex)

		v1.GET("/:database/:collection/fts", server.handleGetFTSConfig)
		v1.POST("/:database/:collection/fts", server.handleSetFTSConfig)

		v1.GET("/:database/:collection/schema", server.handleGetSchema)
		v1.POST("/:database/:collection/schema/validate", server.handleValidateSchema)
		v1.PUT("/:database/:collection/schema", server.handleSetSchema)
		v1.DELETE("/:database/:collection/schema", server.handleSetSchema)

		v1.GET("/:database/:collection/webhooks", server.handleGetWebhooks)
		v1.PUT("/:database/:collection/webhooks", server.handleSetWebhooks)

		v1.GET("/:database/:collection/subscribe", server.handleSubscribe)
		v1.POST("/:database/:collection/publish", server.handlePublish)
		v1.POST("/:database/:collection/heartbeat", server.handleHeartbeat)
		v1.DELETE("/:database/:collection/heartbeat", server.handleLeavePresence)
		v1.GET("/:database/:collection/presence", server.handlePresence)

		v1.GET("/:database/:collection/:id", server.handleDocumentByID)
		v1.PUT("/:database/:collection/:id", server.handleDocumentByID)
		v1.PATCH("/:database/:collection/:id", server.handleDocumentByID)
		v1.DELETE("/:database/:collection/:id", server.handleDocumentByID)
	}

	return r
}

func maxBodyBytesMiddleware(maxBodyBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil && maxBodyBytes > 0 {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
		}
		c.Next()
	}
}

func (s *Server) hasScope(c *gin.Context, required auth.Scope) bool {
	val, exists := c.Get("scope")
	if !exists {
		return true // Auth disabled
	}
	scope, ok := val.(auth.Scope)
	if !ok {
		return false
	}

	// Admin has full access to everything
	if scope == auth.ScopeAdmin {
		return true
	}

	if required == auth.ScopeReadOnly {
		return s.hasCapability(c, auth.CapabilityDocumentsRead)
	}
	if required == auth.ScopeReadWrite {
		return s.hasCapability(c, auth.CapabilityDocumentsWrite)
	}
	if required == auth.ScopeAdmin {
		return false
	}

	// Verify scope level
	hasRightScope := false
	if scope == auth.ScopeReadWrite && (required == auth.ScopeReadWrite || required == auth.ScopeReadOnly) {
		hasRightScope = true
	} else if scope == auth.ScopeReadOnly && required == auth.ScopeReadOnly {
		hasRightScope = true
	}

	if !hasRightScope {
		return false
	}

	// Verify database and collection constraints if applicable
	jwtDb, _ := c.Get("jwt_db")
	jwtColl, _ := c.Get("jwt_coll")

	dbConstraint, _ := jwtDb.(string)
	collConstraint, _ := jwtColl.(string)

	reqDb := c.Param("database")
	reqColl := c.Param("collection")

	if dbConstraint != "*" {
		if reqDb == "" || reqDb != dbConstraint {
			return false
		}
	}
	if collConstraint != "*" {
		if reqColl == "" || reqColl != collConstraint {
			return false
		}
	}

	return true
}

func (s *Server) hasCapability(c *gin.Context, capability auth.Capability) bool {
	return s.hasCapabilityFor(c, capability, c.Param("database"), c.Param("collection"))
}

func (s *Server) hasCapabilityFor(c *gin.Context, capability auth.Capability, database, collection string) bool {
	val, exists := c.Get("scope")
	if !exists {
		return true // Auth disabled
	}
	scope, ok := val.(auth.Scope)
	if !ok {
		return false
	}
	if scope == auth.ScopeAdmin {
		return true
	}

	if !contextHasCapability(c, capability) {
		return false
	}
	return tokenAllowsResource(c, database, collection)
}

func contextHasCapability(c *gin.Context, capability auth.Capability) bool {
	raw, ok := c.Get("capabilities")
	if !ok {
		return false
	}
	capabilities, ok := raw.([]auth.Capability)
	if !ok {
		return false
	}
	for _, current := range capabilities {
		if current == capability {
			return true
		}
	}
	return false
}

func tokenAllowsResource(c *gin.Context, database, collection string) bool {
	jwtDb, _ := c.Get("jwt_db")
	jwtColl, _ := c.Get("jwt_coll")

	dbConstraint, _ := jwtDb.(string)
	collConstraint, _ := jwtColl.(string)

	if dbConstraint != "*" {
		if database == "" || database != dbConstraint {
			return false
		}
	}
	if collConstraint != "*" {
		if collection == "" || collection != collConstraint {
			return false
		}
	}
	return true
}

func tokenID(c *gin.Context) string {
	raw, _ := c.Get("token_id")
	if tokenID, ok := raw.(string); ok && tokenID != "" {
		return tokenID
	}
	rawScope, _ := c.Get("scope")
	if scope, ok := rawScope.(auth.Scope); ok {
		return string(scope)
	}
	return "unknown"
}

func (s *Server) handleDeleteDatabase(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	database := c.Param("database")
	if err := s.store.DeleteDatabase(database); err != nil {
		s.handleStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"deleted": true, "name": database})
}

func (s *Server) handleDeleteCollection(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityCollectionsManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "collections:manage capability required"})
		return
	}
	if err := s.store.DeleteCollection(database, collection); err != nil {
		s.handleStoreError(c, err)
		return
	}
	s.audit.append(auditRecord{Actor: tokenID(c), Action: "collection.delete", Database: database, Collection: collection, Status: "ready"})
	c.JSON(http.StatusOK, map[string]any{"deleted": true, "name": collection})
}

func (s *Server) handleBackupDatabase(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database := c.Param("database")
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", `attachment; filename="`+database+`.db"`)

	if err := s.store.BackupDatabase(c.Request.Context(), database, c.Writer); err != nil {
		if !c.Writer.Written() {
			s.handleStoreError(c, err)
			return
		}
		c.AbortWithError(http.StatusInternalServerError, err)
	}
}
