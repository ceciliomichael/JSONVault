package store

import (
	"testing"
	"time"
	"encoding/binary"
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
		if b == nil { t.Log("no __ttl_index__ bucket"); return nil }
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
