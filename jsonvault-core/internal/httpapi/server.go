package httpapi

import (
	"context"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	CreateDocument(database, collection string, body []byte) (store.Document, error)
	CreateDocumentWithTTL(database, collection string, body []byte, expireIn time.Duration) (store.Document, error)
	ListDocuments(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}, sortField string) ([]store.Document, int, error)
	GetDocument(database, collection, id string) (store.Document, error)
	PutDocument(database, collection, id string, body []byte, expectedETag string) (store.Document, error)
	PutDocumentWithTTL(database, collection, id string, body []byte, expectedETag string, expireIn time.Duration) (store.Document, error)
	PatchDocument(database, collection, id string, body []byte, expectedETag string) (store.Document, error)
	DeleteDocument(database, collection, id string, expectedETag string) error

	ListIndexes(database, collection string) ([]string, error)
	CreateIndex(ctx context.Context, database, collection, field string) error
	DeleteIndex(database, collection, field string) error

	BackupDatabase(ctx context.Context, database string, w io.Writer) error
	
	Subscribe(database, collection string) *store.Subscription
	Unsubscribe(sub *store.Subscription)
	PublishEvent(event store.Event)
	GetSubscriberCount(database, collection string) int
}

type Options struct {
	MaxBodyBytes int64
}

type Server struct {
	store        Store
	maxBodyBytes int64
}

func NewHandler(db Store, authenticator *auth.Authenticator, options Options) http.Handler {
	maxBodyBytes := options.MaxBodyBytes
	if maxBodyBytes < 1 {
		maxBodyBytes = defaultMaxBodyBytes
	}

	server := &Server{
		store:        db,
		maxBodyBytes: maxBodyBytes,
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
		ok, scope := authenticator.Authenticate(c.GetHeader("Authorization"))
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
		c.Set("scope", scope)
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

	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	v1 := r.Group("/api/v1")
	{
		v1.GET("/admin/backup/:database", server.handleBackupDatabase)

		v1.GET("/databases", server.handleDatabases)
		v1.POST("/databases", server.handleDatabases)
		v1.DELETE("/:database", server.handleDeleteDatabase)

		v1.GET("/:database/collections", server.handleCollections)
		v1.POST("/:database/collections", server.handleCollections)
		v1.DELETE("/:database/collections/:collection", server.handleDeleteCollection)

		v1.GET("/:database/:collection", server.handleCollectionDocuments)
		v1.POST("/:database/:collection", server.handleCollectionDocuments)

		v1.GET("/:database/:collection/indexes", server.handleListIndexes)
		v1.POST("/:database/:collection/indexes", server.handleCreateIndex)
		v1.DELETE("/:database/:collection/indexes/:field", server.handleDeleteIndex)

		v1.GET("/:database/:collection/subscribe", server.handleSubscribe)
		v1.POST("/:database/:collection/publish", server.handlePublish)

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
		store:        db,
		maxBodyBytes: maxBodyBytes,
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(maxBodyBytesMiddleware(maxBodyBytes))

	r.Use(func(c *gin.Context) {
		// Mock admin scope for tests
		c.Set("scope", auth.ScopeAdmin)
		c.Next()
	})

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	v1 := r.Group("/api/v1")
	{
		v1.GET("/databases", server.handleDatabases)
		v1.POST("/databases", server.handleDatabases)
		v1.DELETE("/:database", server.handleDeleteDatabase)

		v1.GET("/:database/collections", server.handleCollections)
		v1.POST("/:database/collections", server.handleCollections)
		v1.DELETE("/:database/collections/:collection", server.handleDeleteCollection)

		v1.GET("/:database/:collection", server.handleCollectionDocuments)
		v1.POST("/:database/:collection", server.handleCollectionDocuments)

		v1.GET("/:database/:collection/indexes", server.handleListIndexes)
		v1.POST("/:database/:collection/indexes", server.handleCreateIndex)
		v1.DELETE("/:database/:collection/indexes/:field", server.handleDeleteIndex)

		v1.GET("/:database/:collection/subscribe", server.handleSubscribe)
		v1.POST("/:database/:collection/publish", server.handlePublish)
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

	switch scope {
	case auth.ScopeAdmin:
		return true
	case auth.ScopeReadWrite:
		return required == auth.ScopeReadWrite || required == auth.ScopeReadOnly
	case auth.ScopeReadOnly:
		return required == auth.ScopeReadOnly
	default:
		return false
	}
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
	if !s.hasScope(c, auth.ScopeReadWrite) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	database := c.Param("database")
	collection := c.Param("collection")
	if err := s.store.DeleteCollection(database, collection); err != nil {
		s.handleStoreError(c, err)
		return
	}
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
		// Cannot send JSON error if we already started writing headers/body
		// We can just log or abort
		c.AbortWithError(http.StatusInternalServerError, err)
	}
}
