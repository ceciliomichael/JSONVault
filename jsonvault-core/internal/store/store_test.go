package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
)

func TestStoreDocumentCRUDPersistsJSON(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	created, err := db.CreateDatabase("testdb")
	if err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	if !created {
		t.Fatal("expected database to be created")
	}

	created, err = db.CreateCollection("testdb", "users")
	if err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if !created {
		t.Fatal("expected collection to be created")
	}

	doc, err := db.CreateDocument("testdb", "users", []byte(`{ "name": "Alice", "active": true }`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if doc.ID == "" {
		t.Fatal("expected generated id")
	}
	if !json.Valid(doc.Document) {
		t.Fatalf("document response is invalid JSON: %s", doc.Document)
	}

	got, err := db.GetDocument("testdb", "users", doc.ID)
	if err != nil {
		t.Fatalf("GetDocument: %v", err)
	}
	if string(got.Document) != `{"name":"Alice","active":true}` {
		t.Fatalf("unexpected compacted document: %s", got.Document)
	}

	updated, err := db.PutDocument("testdb", "users", doc.ID, []byte(`{"name":"Alice","active":false}`), "")
	if err != nil {
		t.Fatalf("PutDocument: %v", err)
	}
	if string(updated.Document) != `{"name":"Alice","active":false}` {
		t.Fatalf("unexpected updated document: %s", updated.Document)
	}

	documents, _, err := db.ListDocuments(context.Background(), "testdb", "users", 100, 0, nil)
	if err != nil {
		t.Fatalf("ListDocuments: %v", err)
	}
	if len(documents) != 1 || documents[0].ID != doc.ID {
		t.Fatalf("unexpected document list: %#v", documents)
	}

	if err := db.DeleteDocument("testdb", "users", doc.ID, ""); err != nil {
		t.Fatalf("DeleteDocument: %v", err)
	}
	if _, err := db.GetDocument("testdb", "users", doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestStoreAutoCreatesCollectionOnInsert(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("testdb", "events", []byte(`{"type":"signup"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	databases, err := db.ListDatabases()
	if err != nil {
		t.Fatalf("ListDatabases: %v", err)
	}
	if len(databases) != 1 || databases[0] != "testdb" {
		t.Fatalf("unexpected databases: %#v", databases)
	}

	collections, err := db.ListCollections("testdb")
	if err != nil {
		t.Fatalf("ListCollections: %v", err)
	}
	if len(collections) != 1 || collections[0] != "events" {
		t.Fatalf("unexpected collections: %#v", collections)
	}
}

func TestStoreRejectsInvalidNamesAndJSON(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("../testdb", "users", []byte(`{"ok":true}`)); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected invalid database name, got %v", err)
	}
	if _, err := db.CreateDocument("databases", "users", []byte(`{"ok":true}`)); !errors.Is(err, ErrReservedName) {
		t.Fatalf("expected reserved database name, got %v", err)
	}
	if _, err := db.CreateDocument("testdb", "../users", []byte(`{"ok":true}`)); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected invalid collection name, got %v", err)
	}
	if _, err := db.CreateDocument("testdb", "collections", []byte(`{"ok":true}`)); !errors.Is(err, ErrReservedName) {
		t.Fatalf("expected reserved collection name, got %v", err)
	}
	if _, err := db.CreateDocument("testdb", "users", []byte(`not-json`)); !errors.Is(err, ErrInvalidJSON) {
		t.Fatalf("expected invalid JSON, got %v", err)
	}
	if _, err := db.CreateDocument("testdb", "users", nil); !errors.Is(err, ErrEmptyDocument) {
		t.Fatalf("expected empty document error, got %v", err)
	}
}

func TestFailedUpdateLeavesOriginalFile(t *testing.T) {
	root := t.TempDir()
	db, err := New(root, 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	doc, err := db.CreateDocument("testdb", "users", []byte(`{"version":1}`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	if _, err := db.PutDocument("testdb", "users", doc.ID, []byte(`{"version":`), ""); !errors.Is(err, ErrInvalidJSON) {
		t.Fatalf("expected invalid JSON, got %v", err)
	}

	got, err := db.GetDocument("testdb", "users", doc.ID)
	if err != nil {
		t.Fatalf("GetDocument: %v", err)
	}
	if string(got.Document) != `{"version":1}` {
		t.Fatalf("original file was not preserved: %s", got.Document)
	}
}

func TestStoreConcurrentCreatesStayValid(t *testing.T) {
	db, err := New(t.TempDir(), 32, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	const workers = 24
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := db.CreateDocument("testdb", "events", []byte(`{"type":"signup"}`))
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

	documents, _, err := db.ListDocuments(context.Background(), "testdb", "events", 100, 0, nil)
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

func TestStoreLongOperationsRespectCanceledContext(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("testdb", "events", []byte(`{"type":"signup"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, _, err := db.ListDocuments(ctx, "testdb", "events", 100, 0, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("ListDocuments error = %v, want context.Canceled", err)
	}
	if err := db.CreateIndex(ctx, "testdb", "events", "type"); !errors.Is(err, context.Canceled) {
		t.Fatalf("CreateIndex error = %v, want context.Canceled", err)
	}
	if err := db.BackupDatabase(ctx, "testdb", bytes.NewBuffer(nil)); !errors.Is(err, context.Canceled) {
		t.Fatalf("BackupDatabase error = %v, want context.Canceled", err)
	}
}

func TestListCollectionsHidesInternalBuckets(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("testdb", "events", []byte(`{"type":"signup"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if err := db.CreateIndex(context.Background(), "testdb", "events", "type"); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}

	collections, err := db.ListCollections("testdb")
	if err != nil {
		t.Fatalf("ListCollections: %v", err)
	}
	if len(collections) != 1 || collections[0] != "events" {
		t.Fatalf("unexpected collections: %#v", collections)
	}
}

func TestStoreEvictsDatabaseHandlesSynchronously(t *testing.T) {
	db, err := New(t.TempDir(), 1, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("db1", "events", []byte(`{"n":1}`)); err != nil {
		t.Fatalf("CreateDocument db1: %v", err)
	}
	if _, err := db.CreateDocument("db2", "events", []byte(`{"n":2}`)); err != nil {
		t.Fatalf("CreateDocument db2: %v", err)
	}
	if _, err := db.CreateDocument("db1", "events", []byte(`{"n":3}`)); err != nil {
		t.Fatalf("reopen evicted db1: %v", err)
	}
}
