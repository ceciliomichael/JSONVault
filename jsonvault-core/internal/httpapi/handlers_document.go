package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"io"
	"errors"
	
	"github.com/gin-gonic/gin"
	"jsonvault/internal/store"
	"jsonvault/internal/auth"
)

func (s *Server) handleCollectionDocuments(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	
	switch c.Request.Method {
	case http.MethodGet:
		if !s.hasScope(c, auth.ScopeReadOnly) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		query := c.Request.URL.Query()
		limit := 100
		if l, err := strconv.Atoi(query.Get("limit")); err == nil && l > 0 {
			limit = l
		}
		if limit > 1000 {
			limit = 1000
		}
		offset := 0
		if o, err := strconv.Atoi(query.Get("offset")); err == nil && o >= 0 {
			offset = o
		}

		filter := make(map[string]string)
		for k, v := range query {
			if strings.HasPrefix(k, "filter[") && strings.HasSuffix(k, "]") && len(v) > 0 {
				key := k[7 : len(k)-1]
				filter[key] = v[0]
			}
		}

		if len(filter) > 5 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "too many filters (max 5)"}})
			return
		}
		if offset > 10000 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "offset too large (max 10000)"}})
			return
		}

		documents, total, err := s.store.ListDocuments(database, collection, limit, offset, filter)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}

		c.Header("X-Total-Count", strconv.Itoa(total))
		c.Header("X-Limit", strconv.Itoa(limit))
		c.Header("X-Offset", strconv.Itoa(offset))

		c.JSON(http.StatusOK, documents)
	case http.MethodPost:
		if !s.hasScope(c, auth.ScopeReadWrite) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}
		document, err := s.store.CreateDocument(database, collection, body)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.Header("ETag", document.ETag)
		c.JSON(http.StatusCreated, document)
	default:
		c.AbortWithStatus(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleDocumentByID(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	id := c.Param("id")
	
	switch c.Request.Method {
	case http.MethodGet:
		if !s.hasScope(c, auth.ScopeReadOnly) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		document, err := s.store.GetDocument(database, collection, id)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.Header("ETag", document.ETag)
		c.JSON(http.StatusOK, document)
	case http.MethodPut:
		if !s.hasScope(c, auth.ScopeReadWrite) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}
		document, err := s.store.PutDocument(database, collection, id, body, c.GetHeader("If-Match"))
		if err != nil {
			if errors.Is(err, store.ErrPreconditionFailed) {
				c.JSON(http.StatusPreconditionFailed, gin.H{"error": gin.H{"code": "precondition_failed", "message": "ETag mismatch"}})
				return
			}
			s.handleStoreError(c, err)
			return
		}
		c.Header("ETag", document.ETag)
		c.JSON(http.StatusOK, document)
	case http.MethodPatch:
		if !s.hasScope(c, auth.ScopeReadWrite) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}
		document, err := s.store.PatchDocument(database, collection, id, body, c.GetHeader("If-Match"))
		if err != nil {
			if errors.Is(err, store.ErrPreconditionFailed) {
				c.JSON(http.StatusPreconditionFailed, gin.H{"error": gin.H{"code": "precondition_failed", "message": "ETag mismatch"}})
				return
			}
			s.handleStoreError(c, err)
			return
		}
		c.Header("ETag", document.ETag)
		c.JSON(http.StatusOK, document)
	case http.MethodDelete:
		if !s.hasScope(c, auth.ScopeReadWrite) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if err := s.store.DeleteDocument(database, collection, id, c.GetHeader("If-Match")); err != nil {
			if errors.Is(err, store.ErrPreconditionFailed) {
				c.JSON(http.StatusPreconditionFailed, gin.H{"error": gin.H{"code": "precondition_failed", "message": "ETag mismatch"}})
				return
			}
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"collection": collection,
			"deleted":    true,
			"id":         id,
		})
	default:
		c.AbortWithStatus(http.StatusMethodNotAllowed)
	}
}

func (s *Server) readDocumentBodyGin(c *gin.Context) ([]byte, bool) {
	if c.GetHeader("Content-Type") != "application/json" && !strings.HasPrefix(c.GetHeader("Content-Type"), "application/json;") {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": gin.H{"code": "unsupported_media_type", "message": "Content-Type must be application/json"}})
		return nil, false
	}
	
	body := http.MaxBytesReader(c.Writer, c.Request.Body, s.maxBodyBytes)
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": gin.H{"code": "payload_too_large", "message": "request body exceeds maximum size"}})
			return nil, false
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "could not read request body"}})
		return nil, false
	}
	return data, true
}
