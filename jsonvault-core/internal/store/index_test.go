package store

import (
	"context"
	"reflect"
	"testing"

	bolt "go.etcd.io/bbolt"
)

func TestStoreIndexes(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	db.CreateDatabase("testdb")
	db.CreateCollection("testdb", "users")

	// Create Document before indexing
	doc1, _ := db.CreateDocument("testdb", "users", []byte(`{"email":"alice@example.com","age":30}`))
	doc2, _ := db.CreateDocument("testdb", "users", []byte(`{"email":"bob@example.com","age":25}`))

	// Create Index (should backfill)
	if err := db.CreateIndex(context.Background(), "testdb", "users", "email"); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}

	indexes, err := db.ListIndexes("testdb", "users")
	if err != nil {
		t.Fatalf("ListIndexes: %v", err)
	}
	if !reflect.DeepEqual(indexes, []string{"email"}) {
		t.Fatalf("expected [email], got %v", indexes)
	}

	// Test Indexed Query
	docs, _, err := db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "", "")
	if err != nil {
		t.Fatalf("ListDocuments: %v", err)
	}
	if len(docs) != 1 || docs[0].ID != doc1.ID {
		t.Fatalf("expected doc1, got %v", docs)
	}

	// Test Update
	_, err = db.PutDocument("testdb", "users", doc1.ID, []byte(`{"email":"alice2@example.com","age":31}`), "")
	if err != nil {
		t.Fatalf("PutDocument: %v", err)
	}

	// Old email should return 0 docs
	docs, _, _ = db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "", "")
	if len(docs) != 0 {
		t.Fatalf("expected 0 docs after update, got %v", docs)
	}

	// New email should return doc
	docs, _, _ = db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "alice2@example.com"}, "", "")
	if len(docs) != 1 || docs[0].ID != doc1.ID {
		t.Fatalf("expected doc1 under new email, got %v", docs)
	}

	// Delete Document
	if err := db.DeleteDocument("testdb", "users", doc2.ID, ""); err != nil {
		t.Fatalf("DeleteDocument: %v", err)
	}

	docs, _, _ = db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "bob@example.com"}, "", "")
	if len(docs) != 0 {
		t.Fatalf("expected 0 docs after delete, got %v", docs)
	}

	// Delete Index
	if err := db.DeleteIndex("testdb", "users", "email"); err != nil {
		t.Fatalf("DeleteIndex: %v", err)
	}

	indexes, _ = db.ListIndexes("testdb", "users")
	if len(indexes) != 0 {
		t.Fatalf("expected 0 indexes, got %v", indexes)
	}
}

func TestListDocumentsSortsIndexedMatchesBeforePagination(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateCollection("testdb", "items"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "a", []byte(`{"group":"same","score":30}`), ""); err != nil {
		t.Fatalf("PutDocument a: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "b", []byte(`{"group":"same","score":10}`), ""); err != nil {
		t.Fatalf("PutDocument b: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "c", []byte(`{"group":"same","score":2}`), ""); err != nil {
		t.Fatalf("PutDocument c: %v", err)
	}
	if err := db.CreateIndex(context.Background(), "testdb", "items", "group"); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}

	docs, total, err := db.ListDocuments(context.Background(), "testdb", "items", 2, 0, map[string]interface{}{"group": "same"}, "score", "")
	if err != nil {
		t.Fatalf("ListDocuments indexed sort: %v", err)
	}
	if total != 3 {
		t.Fatalf("total = %d, want 3", total)
	}
	if len(docs) != 2 || docs[0].ID != "c" || docs[1].ID != "b" {
		t.Fatalf("expected sorted first page [c b], got %#v", docs)
	}
}

func TestListDocumentsNumericSortUsesNumericOrdering(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.PutDocument("testdb", "items", "a", []byte(`{"score":30}`), ""); err != nil {
		t.Fatalf("PutDocument a: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "b", []byte(`{"score":10}`), ""); err != nil {
		t.Fatalf("PutDocument b: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "c", []byte(`{"score":2}`), ""); err != nil {
		t.Fatalf("PutDocument c: %v", err)
	}

	docs, _, err := db.ListDocuments(context.Background(), "testdb", "items", 3, 0, nil, "score", "")
	if err != nil {
		t.Fatalf("ListDocuments numeric sort: %v", err)
	}
	if len(docs) != 3 || docs[0].ID != "c" || docs[1].ID != "b" || docs[2].ID != "a" {
		t.Fatalf("expected numeric order [c b a], got %#v", docs)
	}
}

func TestIndexBuildIncludesWritesBeforePromotion(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateCollection("testdb", "items"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	handle, err := db.getDB("testdb")
	if err != nil {
		t.Fatalf("getDB: %v", err)
	}

	if err := db.startIndexBuild(context.Background(), handle, "items", "status"); err != nil {
		t.Fatalf("startIndexBuild: %v", err)
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = db.abortIndexBuild(handle, "items", "status")
		}
	}()

	if _, err := db.PutDocument("testdb", "items", "live", []byte(`{"status":"active","n":1}`), ""); err != nil {
		t.Fatalf("PutDocument during build: %v", err)
	}
	if err := db.finishIndexBuild(context.Background(), handle, "items", "status"); err != nil {
		t.Fatalf("finishIndexBuild: %v", err)
	}
	cleanup = false

	docs, _, err := db.ListDocuments(context.Background(), "testdb", "items", 10, 0, map[string]interface{}{"status": "active"}, "", "")
	if err != nil {
		t.Fatalf("ListDocuments: %v", err)
	}
	if len(docs) != 1 || docs[0].ID != "live" {
		t.Fatalf("expected live document from promoted index, got %#v", docs)
	}
}

func TestIndexBuildAbortRemovesPartialState(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.PutDocument("testdb", "items", "a", []byte(`{"status":"active"}`), ""); err != nil {
		t.Fatalf("PutDocument: %v", err)
	}
	handle, err := db.getDB("testdb")
	if err != nil {
		t.Fatalf("getDB: %v", err)
	}
	if err := db.startIndexBuild(context.Background(), handle, "items", "status"); err != nil {
		t.Fatalf("startIndexBuild: %v", err)
	}
	if err := db.abortIndexBuild(handle, "items", "status"); err != nil {
		t.Fatalf("abortIndexBuild: %v", err)
	}

	if err := handle.View(func(tx *bolt.Tx) error {
		if isIndexBuildingTx(tx, "items", "status") {
			t.Fatal("index build metadata was not removed")
		}
		if tx.Bucket(getIndexBucketName("items", "status")) != nil {
			t.Fatal("partial index bucket was not removed")
		}
		return nil
	}); err != nil {
		t.Fatalf("view: %v", err)
	}

	indexes, err := db.ListIndexes("testdb", "items")
	if err != nil {
		t.Fatalf("ListIndexes: %v", err)
	}
	if len(indexes) != 0 {
		t.Fatalf("expected no completed indexes, got %v", indexes)
	}
}

func TestUnindexRemovesEmptyValueBuckets(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.PutDocument("testdb", "items", "a", []byte(`{"status":"old"}`), ""); err != nil {
		t.Fatalf("PutDocument: %v", err)
	}
	if err := db.CreateIndex(context.Background(), "testdb", "items", "status"); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "a", []byte(`{"status":"new"}`), ""); err != nil {
		t.Fatalf("PutDocument update: %v", err)
	}

	handle, err := db.getDB("testdb")
	if err != nil {
		t.Fatalf("getDB: %v", err)
	}
	if err := handle.View(func(tx *bolt.Tx) error {
		idxBucket := tx.Bucket(getIndexBucketName("items", "status"))
		if idxBucket == nil {
			t.Fatal("missing index bucket")
		}
		if oldBucket := idxBucket.Bucket([]byte("s:old")); oldBucket != nil {
			t.Fatal("old value bucket should have been removed")
		}
		if newBucket := idxBucket.Bucket([]byte("s:new")); newBucket == nil {
			t.Fatal("new value bucket missing")
		}
		return nil
	}); err != nil {
		t.Fatalf("view index: %v", err)
	}
}

func TestCreateIndexRejectsInvalidFieldName(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateCollection("testdb", "items"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if err := db.CreateIndex(context.Background(), "testdb", "items", "bad field"); err == nil {
		t.Fatal("expected invalid field error")
	}
}
