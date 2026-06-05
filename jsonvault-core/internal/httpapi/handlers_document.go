package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"io"
	"errors"
	
	"github.com/gin-gonic/gin"
)

func (s *Server) handleCollectionDocuments(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	
	switch c.Request.Method {
	case http.MethodGet:
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
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}
		document, err := s.store.CreateDocument(database, collection, body)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
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
		document, err := s.store.GetDocument(database, collection, id)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, document)
	case http.MethodPut:
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}
		document, err := s.store.PutDocument(database, collection, id, body)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, document)
	case http.MethodPatch:
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}
		document, err := s.store.PatchDocument(database, collection, id, body)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		c.JSON(http.StatusOK, document)
	case http.MethodDelete:
		if err := s.store.DeleteDocument(database, collection, id); err != nil {
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
