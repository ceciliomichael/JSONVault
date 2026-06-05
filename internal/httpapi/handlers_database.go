package httpapi

import (
	"net/http"
)

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
