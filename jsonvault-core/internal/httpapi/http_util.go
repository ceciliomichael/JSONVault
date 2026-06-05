package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"jsonvault/internal/store"
)

type createNameRequest struct {
	Name string `json:"name"`
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
