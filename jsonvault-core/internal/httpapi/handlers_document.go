package httpapi

import (
	"net/http"
)

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
