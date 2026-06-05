package httpapi

import (
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) handleCollectionDocuments(w http.ResponseWriter, r *http.Request, database, collection string) {
	switch r.Method {
	case http.MethodGet:
		query := r.URL.Query()
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
			s.handleStoreError(w, err)
			return
		}

		w.Header().Set("X-Total-Count", strconv.Itoa(total))
		w.Header().Set("X-Limit", strconv.Itoa(limit))
		w.Header().Set("X-Offset", strconv.Itoa(offset))

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
	case http.MethodPatch:
		body, ok := s.readDocumentBody(w, r)
		if !ok {
			return
		}
		document, err := s.store.PatchDocument(database, collection, id, body)
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
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodPatch, http.MethodDelete)
	}
}
