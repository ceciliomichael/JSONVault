package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bytedance/sonic"
	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
	"jsonvault/internal/store"
)

const maxExpireIn = 365 * 24 * time.Hour

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

		filter := make(map[string]interface{})
		for k, v := range query {
			if strings.HasPrefix(k, "filter[") && strings.HasSuffix(k, "]") && len(v) > 0 {
				key := k[7 : len(k)-1]
				var parsedVal interface{}
				if err := sonic.Unmarshal([]byte(v[0]), &parsedVal); err != nil {
					c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "invalid JSON literal in filter for field: " + key}})
					return
				}
				filter[key] = parsedVal
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

		sortField := query.Get("sort")
		searchQuery := query.Get("search")

		result, err := s.store.ListDocumentsDetailed(c.Request.Context(), database, collection, limit, offset, filter, sortField, searchQuery)
		if err != nil {
			// If the database or collection doesn't exist yet, return an empty list gracefully
			if errors.Is(err, store.ErrNotFound) {
				c.Header("X-Total-Count", "0")
				c.Header("X-Limit", strconv.Itoa(limit))
				c.Header("X-Offset", strconv.Itoa(offset))
				c.JSON(http.StatusOK, []interface{}{})
				return
			}
			if errors.Is(err, store.ErrQueryLimitExceeded) {
				c.JSON(http.StatusUnprocessableEntity, gin.H{"error": queryLimitError(err, filter, sortField, searchQuery, offset)})
				return
			}
			if errors.Is(err, context.DeadlineExceeded) {
				c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{
					"code":    "query_limit_exceeded",
					"message": "query exceeded configured duration budget",
					"reason":  "duration_limit",
					"advice":  queryAdvice(filter, sortField, searchQuery, offset),
				}})
				return
			}
			s.handleStoreError(c, err)
			return
		}

		c.Header("X-Total-Count", strconv.Itoa(result.Total))
		c.Header("X-Limit", strconv.Itoa(limit))
		c.Header("X-Offset", strconv.Itoa(offset))
		c.Header("X-JSONVault-Scanned-Documents", strconv.Itoa(result.Stats.ScannedDocuments))
		c.Header("X-JSONVault-Scanned-Bytes", strconv.FormatInt(result.Stats.ScannedBytes, 10))
		c.Header("X-JSONVault-Returned-Bytes", strconv.FormatInt(result.Stats.ReturnedBytes, 10))
		if result.Stats.IndexUsed != "" {
			c.Header("X-JSONVault-Index-Used", result.Stats.IndexUsed)
		}
		if result.Stats.SortMode != "" {
			c.Header("X-JSONVault-Sort-Mode", result.Stats.SortMode)
		}
		if result.Stats.FTSCandidates > 0 {
			c.Header("X-JSONVault-FTS-Candidates", strconv.Itoa(result.Stats.FTSCandidates))
		}
		if len(filter) > 0 && result.Stats.IndexUsed == "" {
			c.Header("X-JSONVault-Warning", "unindexed_filter")
		}
		if sortField != "" && result.Stats.SortMode == "in_memory" {
			c.Header("X-JSONVault-Sort-Warning", "in_memory_sort")
		}
		if offset > 0 {
			c.Header("X-JSONVault-Pagination-Warning", "offset_pagination")
		}

		if query.Get("explain") == "true" {
			c.JSON(http.StatusOK, gin.H{
				"total":  result.Total,
				"limit":  limit,
				"offset": offset,
				"stats":  result.Stats,
			})
			return
		}
		c.JSON(http.StatusOK, result.Documents)
	case http.MethodPost:
		if !s.hasScope(c, auth.ScopeReadWrite) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		body, ok := s.readDocumentBodyGin(c)
		if !ok {
			return
		}

		expireIn, ok := parseExpireIn(c)
		if !ok {
			return
		}
		document, err := s.store.CreateDocumentWithTTL(database, collection, body, expireIn)
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

func queryLimitError(err error, filter map[string]interface{}, sortField, searchQuery string, offset int) gin.H {
	return gin.H{
		"code":    "query_limit_exceeded",
		"message": err.Error(),
		"reason":  queryLimitReason(err),
		"advice":  queryAdvice(filter, sortField, searchQuery, offset),
	}
}

func queryLimitReason(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "scanned documents"):
		return "scan_docs_limit"
	case strings.Contains(msg, "scanned bytes"):
		return "scan_bytes_limit"
	case strings.Contains(msg, "response bytes"):
		return "response_bytes_limit"
	case strings.Contains(msg, "fts candidates"):
		return "fts_candidates_limit"
	default:
		return "resource_limit"
	}
}

func queryAdvice(filter map[string]interface{}, sortField, searchQuery string, offset int) []string {
	advice := []string{"lower_limit"}
	if len(filter) > 0 {
		advice = append(advice, "narrow_filter", "request_index")
	}
	if sortField != "" {
		advice = append(advice, "narrow_filter_before_sort")
	}
	if searchQuery != "" {
		advice = append(advice, "use_more_specific_search")
	}
	if offset > 0 {
		advice = append(advice, "avoid_deep_offset")
	}
	return advice
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

		expireIn, ok := parseExpireIn(c)
		if !ok {
			return
		}
		document, err := s.store.PutDocumentWithTTL(database, collection, id, body, c.GetHeader("If-Match"), expireIn)
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

func parseExpireIn(c *gin.Context) (time.Duration, bool) {
	expireStr := c.GetHeader("X-Expire-In")
	if expireStr == "" {
		return 0, true
	}
	expireInt, err := strconv.ParseInt(expireStr, 10, 64)
	if err != nil || expireInt <= 0 || expireInt > int64(maxExpireIn/time.Second) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "X-Expire-In must be a positive number of seconds no greater than 31536000"}})
		return 0, false
	}
	return time.Duration(expireInt) * time.Second, true
}
