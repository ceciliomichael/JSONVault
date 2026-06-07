package store

import (
	"bytes"
	"context"
	"strconv"
	"testing"
)

func BenchmarkCreateDocument(b *testing.B) {
	b.ReportAllocs()
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
	b.ReportAllocs()
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
	b.ReportAllocs()
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
		_, _, err := db.ListDocuments(context.Background(), "benchdb", "users", 100, 0, map[string]interface{}{}, "", "")
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
	}
}

func BenchmarkListDocumentsWithoutIndex(b *testing.B) {
	b.ReportAllocs()
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	db.CreateDatabase("benchdb")
	db.CreateCollection("benchdb", "users")

	for i := 0; i < 1000; i++ {
		docBody := []byte(`{"email":"user` + strconv.Itoa(i) + `@example.com","active":true}`)
		db.CreateDocument("benchdb", "users", docBody)
	}
	db.CreateDocument("benchdb", "users", []byte(`{"email":"alice@example.com","active":true}`))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		docs, _, err := db.ListDocuments(context.Background(), "benchdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "", "")
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
		if len(docs) != 1 {
			b.Fatalf("expected 1 doc, got %d", len(docs))
		}
	}
}

func BenchmarkListDocumentsWithIndex(b *testing.B) {
	b.ReportAllocs()
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
		docBody := []byte(`{"email":"user` + strconv.Itoa(i) + `@example.com","active":true}`)
		db.CreateDocument("benchdb", "users", docBody)
	}
	db.CreateDocument("benchdb", "users", []byte(`{"email":"alice@example.com","active":true}`))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		docs, _, err := db.ListDocuments(context.Background(), "benchdb", "users", 10, 0, map[string]interface{}{"email": "alice@example.com"}, "", "")
		if err != nil {
			b.Fatalf("ListDocuments: %v", err)
		}
		if len(docs) != 1 {
			b.Fatalf("expected 1 doc, got %d", len(docs))
		}
	}
}

func BenchmarkListDocumentsSorted(b *testing.B) {
	b.ReportAllocs()
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	for i := 0; i < 1000; i++ {
		docBody := []byte(`{"name":"Bench","score":` + strconv.Itoa(1000-i) + `}`)
		if _, err := db.CreateDocument("benchdb", "items", docBody); err != nil {
			b.Fatalf("CreateDocument: %v", err)
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		docs, _, err := db.ListDocuments(context.Background(), "benchdb", "items", 50, 0, nil, "score", "")
		if err != nil {
			b.Fatalf("ListDocuments sort: %v", err)
		}
		if len(docs) != 50 {
			b.Fatalf("docs = %d, want 50", len(docs))
		}
	}
}

func BenchmarkFTSSearch(b *testing.B) {
	b.ReportAllocs()
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	for i := 0; i < 1000; i++ {
		docBody := []byte(`{"body":"searchable document number ` + strconv.Itoa(i) + ` with common text"}`)
		if _, err := db.CreateDocument("benchdb", "posts", docBody); err != nil {
			b.Fatalf("CreateDocument: %v", err)
		}
	}
	if err := db.SetFTSConfig("benchdb", "posts", []string{"body"}); err != nil {
		b.Fatalf("SetFTSConfig: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		results, err := db.SearchFTS("benchdb", "posts", "searchable")
		if err != nil {
			b.Fatalf("SearchFTS: %v", err)
		}
		if len(results) != 1000 {
			b.Fatalf("results = %d, want 1000", len(results))
		}
	}
}

func BenchmarkBackupDatabase(b *testing.B) {
	b.ReportAllocs()
	db, err := New(b.TempDir(), 8, nil)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	for i := 0; i < 1000; i++ {
		docBody := []byte(`{"name":"Bench","payload":"` + strconv.Itoa(i) + `"}`)
		if _, err := db.CreateDocument("benchdb", "docs", docBody); err != nil {
			b.Fatalf("CreateDocument: %v", err)
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out bytes.Buffer
		if err := db.BackupDatabase(context.Background(), "benchdb", &out); err != nil {
			b.Fatalf("BackupDatabase: %v", err)
		}
		if out.Len() == 0 {
			b.Fatal("empty backup")
		}
	}
}

func BenchmarkEncryptedCreateDocument(b *testing.B) {
	b.ReportAllocs()
	key := bytes.Repeat([]byte{1}, 32)
	db, err := New(b.TempDir(), 8, key)
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer db.Close()
	docBody := []byte(`{"name":"Bench","active":true}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := db.CreateDocument("benchdb", "users", docBody); err != nil {
			b.Fatalf("CreateDocument: %v", err)
		}
	}
}
