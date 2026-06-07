package store

import (
	"context"
	"encoding/binary"
	stdjson "encoding/json"
	"errors"
	"testing"
	"time"

	bolt "go.etcd.io/bbolt"
)

func TestTTLManualPurge(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	// 1. Create a document with 1 second TTL
	doc, err := db.CreateDocumentWithTTL("testdb", "users", []byte(`{"name":"Bob"}`), 1*time.Second)
	if err != nil {
		t.Fatalf("CreateDocumentWithTTL: %v", err)
	}

	// 2. Call purge instantly (should NOT delete it yet)
	db.purgeExpiredDocuments()

	_, err = db.GetDocument("testdb", "users", doc.ID)
	if err != nil {
		t.Fatalf("expected document to still exist before TTL: %v", err)
	}

	// 3. Sleep 2 seconds so it technically expires
	time.Sleep(2 * time.Second)

	dbHandle, _ := db.getDB("testdb")
	dbHandle.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("__ttl_index__"))
		if b == nil {
			t.Log("no __ttl_index__ bucket")
			return nil
		}
		c := b.Cursor()
		for k, _ := c.First(); k != nil; k, _ = c.Next() {
			if len(k) >= 8 {
				t.Logf("Found key in ttl index. expireAt: %d, nowUnix: %d", binary.BigEndian.Uint64(k[0:8]), time.Now().Unix())
			}
		}
		return nil
	})

	// 4. Manually trigger the purge function
	db.purgeExpiredDocuments()

	// 5. Verify it was deleted
	_, err = db.GetDocument("testdb", "users", doc.ID)
	if err != ErrNotFound {
		t.Fatalf("expected document to be deleted by TTL, got err: %v", err)
	}
}

func TestTTLUpdateReplacesOldExpiry(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	doc, err := db.PutDocumentWithTTL("testdb", "sessions", "session-1", []byte(`{"state":"old"}`), "", 1*time.Second)
	if err != nil {
		t.Fatalf("PutDocumentWithTTL initial: %v", err)
	}
	if _, err := db.PutDocumentWithTTL("testdb", "sessions", "session-1", []byte(`{"state":"fresh"}`), doc.ETag, time.Hour); err != nil {
		t.Fatalf("PutDocumentWithTTL replacement: %v", err)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}

	got, err := db.GetDocument("testdb", "sessions", "session-1")
	if err != nil {
		t.Fatalf("GetDocument after old expiry: %v", err)
	}
	if string(got.Document) != `{"state":"fresh"}` {
		t.Fatalf("document was not updated: %s", got.Document)
	}
}

func TestPutWithoutTTLClearsExistingTTL(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	doc, err := db.PutDocumentWithTTL("testdb", "sessions", "session-1", []byte(`{"state":"ttl"}`), "", 1*time.Second)
	if err != nil {
		t.Fatalf("PutDocumentWithTTL: %v", err)
	}
	if _, err := db.PutDocument("testdb", "sessions", "session-1", []byte(`{"state":"persistent"}`), doc.ETag); err != nil {
		t.Fatalf("PutDocument: %v", err)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}

	got, err := db.GetDocument("testdb", "sessions", "session-1")
	if err != nil {
		t.Fatalf("GetDocument after cleared ttl: %v", err)
	}
	if string(got.Document) != `{"state":"persistent"}` {
		t.Fatalf("document was not persisted: %s", got.Document)
	}
}

func TestTransactionPutClearsExistingTTL(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	doc, err := db.PutDocumentWithTTL("testdb", "sessions", "session-1", []byte(`{"state":"ttl"}`), "", 1*time.Second)
	if err != nil {
		t.Fatalf("PutDocumentWithTTL: %v", err)
	}
	if _, err := db.ExecuteTransaction("testdb", []TransactionOp{
		{
			Action:       "put",
			Collection:   "sessions",
			ID:           "session-1",
			Body:         stdjson.RawMessage(`{"state":"persistent"}`),
			ExpectedETag: doc.ETag,
		},
	}); err != nil {
		t.Fatalf("ExecuteTransaction: %v", err)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}

	got, err := db.GetDocument("testdb", "sessions", "session-1")
	if err != nil {
		t.Fatalf("GetDocument after transaction cleared ttl: %v", err)
	}
	if string(got.Document) != `{"state":"persistent"}` {
		t.Fatalf("document was not persisted: %s", got.Document)
	}
}

func TestPatchPreservesExistingTTL(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	doc, err := db.CreateDocumentWithTTL("testdb", "sessions", []byte(`{"state":"ttl"}`), 1*time.Second)
	if err != nil {
		t.Fatalf("CreateDocumentWithTTL: %v", err)
	}
	if _, err := db.PatchDocument("testdb", "sessions", doc.ID, []byte(`{"patched":true}`), doc.ETag); err != nil {
		t.Fatalf("PatchDocument: %v", err)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}

	if _, err := db.GetDocument("testdb", "sessions", doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected patched ttl document to expire, got %v", err)
	}
}

func TestDeleteDocumentRemovesTTLIndex(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	doc, err := db.CreateDocumentWithTTL("testdb", "sessions", []byte(`{"state":"ttl"}`), 1*time.Second)
	if err != nil {
		t.Fatalf("CreateDocumentWithTTL: %v", err)
	}
	if err := db.DeleteDocument("testdb", "sessions", doc.ID, doc.ETag); err != nil {
		t.Fatalf("DeleteDocument: %v", err)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}

	docs, total, err := db.ListDocuments(context.Background(), "testdb", "sessions", 10, 0, nil, "", "")
	if err != nil {
		t.Fatalf("ListDocuments: %v", err)
	}
	if len(docs) != 0 || total != 0 {
		t.Fatalf("expected no docs and total 0, got len=%d total=%d", len(docs), total)
	}
}

func TestTTLPurgeRemovesSecondaryAndFTSIndexes(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateCollection("testdb", "posts"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if err := db.CreateIndex(context.Background(), "testdb", "posts", "email"); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}
	if err := db.SetFTSConfig("testdb", "posts", []string{"body"}); err != nil {
		t.Fatalf("SetFTSConfig: %v", err)
	}
	if _, err := db.CreateDocumentWithTTL("testdb", "posts", []byte(`{"email":"a@example.com","body":"hello searchable"}`), 1*time.Second); err != nil {
		t.Fatalf("CreateDocumentWithTTL: %v", err)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}

	docs, _, err := db.ListDocuments(context.Background(), "testdb", "posts", 10, 0, map[string]interface{}{"email": "a@example.com"}, "", "")
	if err != nil {
		t.Fatalf("ListDocuments indexed filter: %v", err)
	}
	if len(docs) != 0 {
		t.Fatalf("expected secondary index to be cleaned, got %d docs", len(docs))
	}

	allDocs, total, err := db.ListDocuments(context.Background(), "testdb", "posts", 10, 0, nil, "", "")
	if err != nil {
		t.Fatalf("ListDocuments all: %v", err)
	}
	if len(allDocs) != 0 || total != 0 {
		t.Fatalf("expected purge to clean document and count, got len=%d total=%d", len(allDocs), total)
	}

	results, err := db.SearchFTS("testdb", "posts", "searchable")
	if err != nil {
		t.Fatalf("SearchFTS: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected FTS index to be cleaned, got %v", results)
	}
}
