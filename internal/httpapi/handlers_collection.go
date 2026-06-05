package httpapi

import (
	"net/http"
)

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
