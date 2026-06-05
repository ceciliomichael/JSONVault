package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

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
	ListDocuments(database, collection string) ([]store.Document, error)
	GetDocument(database, collection, id string) (store.Document, error)
	PutDocument(database, collection, id string, body []byte) (store.Document, error)
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

	var handler http.Handler = server
	if authenticator != nil {
		handler = authenticator.Middleware(handler)
	}
	handler = securityHeaders(handler)
	return handler
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/healthz" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/")
	if path == r.URL.Path {
		writeError(w, http.StatusNotFound, "not_found", "route not found")
		return
	}

	if path == "databases" || path == "databases/" {
		s.handleDatabases(w, r)
		return
	}

	parts := routeParts(path)
	if len(parts) == 0 {
		writeError(w, http.StatusNotFound, "not_found", "route not found")
		return
	}

	database := parts[0]

	if len(parts) == 1 {
		if r.Method == http.MethodDelete {
			if err := s.store.DeleteDatabase(database); err != nil {
				s.handleStoreError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "name": database})
			return
		}
		writeMethodNotAllowed(w, http.MethodDelete)
		return
	}

	if parts[1] == "collections" {
		if len(parts) == 2 {
			s.handleCollections(w, r, database)
			return
		}
		if len(parts) == 3 && r.Method == http.MethodDelete {
			collection := parts[2]
			if err := s.store.DeleteCollection(database, collection); err != nil {
				s.handleStoreError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "name": collection})
			return
		}
		writeError(w, http.StatusNotFound, "not_found", "route not found")
		return
	}

	collection := parts[1]
	if len(parts) == 2 {
		s.handleCollectionDocuments(w, r, database, collection)
		return
	}

	if len(parts) == 3 {
		id := parts[2]
		s.handleDocumentByID(w, r, database, collection, id)
		return
	}

	writeError(w, http.StatusNotFound, "not_found", "route not found")
}

func (s *Server) handleDatabases(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		databases, err := s.store.ListDatabases()
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, databases)
	case http.MethodPost:
		var req createNameRequest
		if !s.decodeJSON(w, r, &req) {
			return
		}
		created, err := s.store.CreateDatabase(req.Name)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		writeJSON(w, status, map[string]any{
			"name":    req.Name,
			"created": created,
		})
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) handleCollections(w http.ResponseWriter, r *http.Request, database string) {
	switch r.Method {
	case http.MethodGet:
		collections, err := s.store.ListCollections(database)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, collections)
	case http.MethodPost:
		var req createNameRequest
		if !s.decodeJSON(w, r, &req) {
			return
		}
		created, err := s.store.CreateCollection(database, req.Name)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		writeJSON(w, status, map[string]any{
			"name":    req.Name,
			"created": created,
		})
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) handleCollectionDocuments(w http.ResponseWriter, r *http.Request, database, collection string) {
	switch r.Method {
	case http.MethodGet:
		documents, err := s.store.ListDocuments(database, collection)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, documents)
	case http.MethodPost:
		body, ok := s.readDocumentBody(w, r)
		if !ok {
			return
		}
		document, err := s.store.CreateDocument(database, collection, body)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, document)
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) handleDocumentByID(w http.ResponseWriter, r *http.Request, database, collection, id string) {
	switch r.Method {
	case http.MethodGet:
		document, err := s.store.GetDocument(database, collection, id)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, document)
	case http.MethodPut:
		body, ok := s.readDocumentBody(w, r)
		if !ok {
			return
		}
		document, err := s.store.PutDocument(database, collection, id, body)
		if err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, document)
	case http.MethodDelete:
		if err := s.store.DeleteDocument(database, collection, id); err != nil {
			s.handleStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"collection": collection,
			"deleted":    true,
			"id":         id,
		})
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodDelete)
	}
}

func (s *Server) decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if !requireJSONContent(w, r) {
		return false
	}

	body, ok := s.readBody(w, r)
	if !ok {
		return false
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "request body must be valid JSON")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "bad_request", "request body must contain exactly one JSON value")
		return false
	}
	return true
}

func (s *Server) readDocumentBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	if !requireJSONContent(w, r) {
		return nil, false
	}
	return s.readBody(w, r)
}

func (s *Server) readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	body := http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "request body exceeds maximum size")
			return nil, false
		}
		writeError(w, http.StatusBadRequest, "bad_request", "could not read request body")
		return nil, false
	}
	return data, true
}

func requireJSONContent(w http.ResponseWriter, r *http.Request) bool {
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json")
		return false
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil || !strings.EqualFold(mediaType, "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json")
		return false
	}
	return true
}

func routeParts(path string) []string {
	raw := strings.Split(strings.Trim(path, "/"), "/")
	parts := raw[:0]
	for _, part := range raw {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return parts
}

func (s *Server) handleStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case errors.Is(err, store.ErrInvalidName), errors.Is(err, store.ErrReservedName):
		writeError(w, http.StatusBadRequest, "invalid_name", err.Error())
	case errors.Is(err, store.ErrInvalidJSON), errors.Is(err, store.ErrEmptyDocument):
		writeError(w, http.StatusBadRequest, "invalid_json", "request body must be a non-empty valid JSON value")
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
	}
}

func writeMethodNotAllowed(w http.ResponseWriter, allowed ...string) {
	w.Header().Set("Allow", strings.Join(allowed, ", "))
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

type createNameRequest struct {
	Name string `json:"name"`
}
