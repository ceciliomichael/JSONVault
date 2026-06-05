package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestStoreDocumentCRUDPersistsJSON(t *testing.T) {
	db, err := New(t.TempDir(), 8)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	created, err := db.CreateCollection("users")
	if err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if !created {
		t.Fatal("expected collection to be created")
	}

	doc, err := db.CreateDocument("users", []byte(`{ "name": "Alice", "active": true }`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if doc.ID == "" {
		t.Fatal("expected generated id")
	}
	if !json.Valid(doc.Document) {
		t.Fatalf("document response is invalid JSON: %s", doc.Document)
	}

	got, err := db.GetDocument("users", doc.ID)
	if err != nil {
		t.Fatalf("GetDocument: %v", err)
	}
	if string(got.Document) != `{"name":"Alice","active":true}` {
		t.Fatalf("unexpected compacted document: %s", got.Document)
	}

	updated, err := db.PutDocument("users", doc.ID, []byte(`{"name":"Alice","active":false}`))
	if err != nil {
		t.Fatalf("PutDocument: %v", err)
	}
	if string(updated.Document) != `{"name":"Alice","active":false}` {
		t.Fatalf("unexpected updated document: %s", updated.Document)
	}

	documents, err := db.ListDocuments("users")
	if err != nil {
		t.Fatalf("ListDocuments: %v", err)
	}
	if len(documents) != 1 || documents[0].ID != doc.ID {
		t.Fatalf("unexpected document list: %#v", documents)
	}

	if err := db.DeleteDocument("users", doc.ID); err != nil {
		t.Fatalf("DeleteDocument: %v", err)
	}
	if _, err := db.GetDocument("users", doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestStoreAutoCreatesCollectionOnInsert(t *testing.T) {
	db, err := New(t.TempDir(), 8)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := db.CreateDocument("events", []byte(`{"type":"signup"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	collections, err := db.ListCollections()
	if err != nil {
		t.Fatalf("ListCollections: %v", err)
	}
	if len(collections) != 1 || collections[0] != "events" {
		t.Fatalf("unexpected collections: %#v", collections)
	}
}

func TestStoreRejectsInvalidNamesAndJSON(t *testing.T) {
	db, err := New(t.TempDir(), 8)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := db.CreateDocument("../users", []byte(`{"ok":true}`)); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected invalid collection name, got %v", err)
	}
	if _, err := db.CreateDocument("collections", []byte(`{"ok":true}`)); !errors.Is(err, ErrReservedName) {
		t.Fatalf("expected reserved collection name, got %v", err)
	}
	if _, err := db.CreateDocument("users", []byte(`not-json`)); !errors.Is(err, ErrInvalidJSON) {
		t.Fatalf("expected invalid JSON, got %v", err)
	}
	if _, err := db.CreateDocument("users", nil); !errors.Is(err, ErrEmptyDocument) {
		t.Fatalf("expected empty document error, got %v", err)
	}
}

func TestFailedUpdateLeavesOriginalFile(t *testing.T) {
	root := t.TempDir()
	db, err := New(root, 8)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	doc, err := db.CreateDocument("users", []byte(`{"version":1}`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	if _, err := db.PutDocument("users", doc.ID, []byte(`{"version":`)); !errors.Is(err, ErrInvalidJSON) {
		t.Fatalf("expected invalid JSON, got %v", err)
	}

	path := filepath.Join(root, "users", doc.ID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != `{"version":1}` {
		t.Fatalf("original file was not preserved: %s", data)
	}
}

func TestStoreConcurrentCreatesStayValid(t *testing.T) {
	db, err := New(t.TempDir(), 32)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	const workers = 24
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := db.CreateDocument("events", []byte(`{"type":"signup"}`))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("CreateDocument: %v", err)
		}
	}

	documents, err := db.ListDocuments("events")
	if err != nil {
		t.Fatalf("ListDocuments: %v", err)
	}
	if len(documents) != workers {
		t.Fatalf("document count = %d, want %d", len(documents), workers)
	}
	for _, document := range documents {
		if !json.Valid(document.Document) {
			t.Fatalf("invalid stored JSON for %s: %s", document.ID, document.Document)
		}
	}
}
