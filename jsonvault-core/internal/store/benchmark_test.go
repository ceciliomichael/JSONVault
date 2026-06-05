package store

import (
	"testing"
)

func BenchmarkCreateDocument(b *testing.B) {
	db, err := New(b.TempDir(), 8)
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
	db, err := New(b.TempDir(), 8)
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
	db, err := New(b.TempDir(), 8)
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
		_, _, err := db.ListDocuments("benchdb", "users", 100, 0, nil)
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
	}
}
