package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
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
	ListDocuments(database, collection string, limit, offset int, filter map[string]string) ([]store.Document, int, error)
	GetDocument(database, collection, id string) (store.Document, error)
	PutDocument(database, collection, id string, body []byte) (store.Document, error)
	PatchDocument(database, collection, id string, body []byte) (store.Document, error)
	DeleteDocument(database, collection, id string) error
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

	if authenticator != nil {
		r.Use(func(c *gin.Context) {
			if c.Request.URL.Path == "/healthz" {
				c.Next()
				return
			}
			if !authenticator.Authenticate(c.GetHeader("Authorization")) {
				c.Header("WWW-Authenticate", `Bearer realm="jsonvault"`)
				c.AbortWithStatusJSON(http.StatusUnauthorized, map[string]any{
					"error": map[string]string{
						"code":    "unauthorized",
						"message": "missing or invalid bearer token",
					},
				})
				return
			}
			c.Next()
		})
	}

	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "no-store")
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

		v1.GET("/:database/:collection/:id", server.handleDocumentByID)
		v1.PUT("/:database/:collection/:id", server.handleDocumentByID)
		v1.PATCH("/:database/:collection/:id", server.handleDocumentByID)
		v1.DELETE("/:database/:collection/:id", server.handleDocumentByID)
	}

	return r
}

func (s *Server) handleDeleteDatabase(c *gin.Context) {
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
	if err := s.store.DeleteCollection(database, collection); err != nil {
		s.handleStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"deleted": true, "name": collection})
}
