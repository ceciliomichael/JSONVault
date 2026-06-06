package store

import (
	"context"
	"reflect"
	"testing"
)

func TestStoreIndexes(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

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
	docs, _, err := db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "")
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
	docs, _, _ = db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "")
	if len(docs) != 0 {
		t.Fatalf("expected 0 docs after update, got %v", docs)
	}

	// New email should return doc
	docs, _, _ = db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "alice2@example.com"}, "")
	if len(docs) != 1 || docs[0].ID != doc1.ID {
		t.Fatalf("expected doc1 under new email, got %v", docs)
	}

	// Delete Document
	if err := db.DeleteDocument("testdb", "users", doc2.ID, ""); err != nil {
		t.Fatalf("DeleteDocument: %v", err)
	}

	docs, _, _ = db.ListDocuments(context.Background(), "testdb", "users", 10, 0, map[string]interface{}{"email": "bob@example.com"}, "")
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
