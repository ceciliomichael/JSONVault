package httpapi

import (
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
