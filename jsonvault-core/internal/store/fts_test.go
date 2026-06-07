package store

import (
	"testing"

	bolt "go.etcd.io/bbolt"
)

func TestSetFTSConfigBackfillsExistingDocuments(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateDocument("testdb", "posts", []byte(`{"title":"Before config","body":"searchable text"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if err := db.SetFTSConfig("testdb", "posts", []string{"body"}); err != nil {
		t.Fatalf("SetFTSConfig: %v", err)
	}

	results, err := db.SearchFTS("testdb", "posts", "searchable")
	if err != nil {
		t.Fatalf("SearchFTS: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected existing document to be backfilled, got %v", results)
	}
}

func TestSetFTSConfigRebuildsWhenFieldsChange(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateDocument("testdb", "posts", []byte(`{"title":"alpha","body":"beta"}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if err := db.SetFTSConfig("testdb", "posts", []string{"title"}); err != nil {
		t.Fatalf("SetFTSConfig title: %v", err)
	}
	if results, err := db.SearchFTS("testdb", "posts", "alpha"); err != nil || len(results) != 1 {
		t.Fatalf("expected title result before rebuild, results=%v err=%v", results, err)
	}

	if err := db.SetFTSConfig("testdb", "posts", []string{"body"}); err != nil {
		t.Fatalf("SetFTSConfig body: %v", err)
	}
	if results, err := db.SearchFTS("testdb", "posts", "alpha"); err != nil || len(results) != 0 {
		t.Fatalf("expected stale title token to be removed, results=%v err=%v", results, err)
	}
	if results, err := db.SearchFTS("testdb", "posts", "beta"); err != nil || len(results) != 1 {
		t.Fatalf("expected body token after rebuild, results=%v err=%v", results, err)
	}
}

func TestFTSUsesNestedPostingBuckets(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if err := db.SetFTSConfig("testdb", "posts", []string{"body"}); err != nil {
		t.Fatalf("SetFTSConfig: %v", err)
	}
	if _, err := db.CreateDocument("testdb", "posts", []byte(`{"body":"common term"}`)); err != nil {
		t.Fatalf("CreateDocument one: %v", err)
	}
	if _, err := db.CreateDocument("testdb", "posts", []byte(`{"body":"common word"}`)); err != nil {
		t.Fatalf("CreateDocument two: %v", err)
	}

	handle, err := db.getDB("testdb")
	if err != nil {
		t.Fatalf("getDB: %v", err)
	}
	if err := handle.View(func(tx *bolt.Tx) error {
		idxBucket := tx.Bucket(ftsIndexBucket)
		if idxBucket == nil {
			t.Fatal("missing FTS index bucket")
		}
		tokenBucket := idxBucket.Bucket([]byte("posts:common"))
		if tokenBucket == nil {
			t.Fatal("expected token posting list to be a nested bucket")
		}
		if tokenBucket.Stats().KeyN != 2 {
			t.Fatalf("posting count = %d, want 2", tokenBucket.Stats().KeyN)
		}
		return nil
	}); err != nil {
		t.Fatalf("view FTS bucket: %v", err)
	}
}
