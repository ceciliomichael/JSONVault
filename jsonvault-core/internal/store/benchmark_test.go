package store

import (
	"context"
	"testing"
)

func BenchmarkCreateDocument(b *testing.B) {
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	db.CreateDatabase("benchdb")
	db.CreateCollection("benchdb", "users")
	docBody := []byte(`{"name":"Bench","active":true}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := db.CreateDocument("benchdb", "users", docBody)
		if err != nil {
			b.Fatalf("CreateDocument: %v", err)
		}
	}
}

func BenchmarkGetDocument(b *testing.B) {
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	db.CreateDatabase("benchdb")
	db.CreateCollection("benchdb", "users")

	docBody := []byte(`{"name":"Bench","active":true}`)
	doc, _ := db.CreateDocument("benchdb", "users", docBody)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := db.GetDocument("benchdb", "users", doc.ID)
		if err != nil {
			b.Fatalf("GetDocument: %v", err)
		}
	}
}

func BenchmarkListDocuments(b *testing.B) {
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	db.CreateDatabase("benchdb")
	db.CreateCollection("benchdb", "users")

	docBody := []byte(`{"name":"Bench","active":true}`)
	for i := 0; i < 1000; i++ {
		db.CreateDocument("benchdb", "users", docBody)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, err := db.ListDocuments(context.Background(), "benchdb", "users", 100, 0, map[string]interface{}{}, "")
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
	}
}

func BenchmarkListDocumentsWithoutIndex(b *testing.B) {
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	db.CreateDatabase("benchdb")
	db.CreateCollection("benchdb", "users")

	for i := 0; i < 1000; i++ {
		docBody := []byte(`{"email":"user` + string(rune(i)) + `@example.com","active":true}`)
		db.CreateDocument("benchdb", "users", docBody)
	}
	db.CreateDocument("benchdb", "users", []byte(`{"email":"alice@example.com","active":true}`))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		docs, _, err := db.ListDocuments(context.Background(), "benchdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "")
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
		if len(docs) != 1 {
			b.Fatalf("expected 1 doc, got %d", len(docs))
		}
	}
}

func BenchmarkListDocumentsWithIndex(b *testing.B) {
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	db.CreateDatabase("benchdb")
	db.CreateCollection("benchdb", "users")

	// Create index BEFORE inserting documents
	if err := db.CreateIndex(context.Background(), "benchdb", "users", "email"); err != nil {
		b.Fatalf("CreateIndex: %v", err)
	}

	for i := 0; i < 1000; i++ {
		docBody := []byte(`{"email":"user` + string(rune(i)) + `@example.com","active":true}`)
		db.CreateDocument("benchdb", "users", docBody)
	}
	db.CreateDocument("benchdb", "users", []byte(`{"email":"alice@example.com","active":true}`))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		docs, _, err := db.ListDocuments(context.Background(), "benchdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "")
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
		if len(docs) != 1 {
			b.Fatalf("expected 1 doc, got %d", len(docs))
		}
	}
}
