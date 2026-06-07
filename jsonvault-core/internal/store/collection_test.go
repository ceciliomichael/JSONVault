package store

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDeleteCollectionRemovesOwnedMetadata(t *testing.T) {
	t.Setenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS", "true")

	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateCollection("testdb", "items"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if err := db.CreateIndex(context.Background(), "testdb", "items", "kind"); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}
	if err := db.SetFTSConfig("testdb", "items", []string{"body"}); err != nil {
		t.Fatalf("SetFTSConfig: %v", err)
	}
	if _, err := db.PutDocumentWithTTL("testdb", "items", "item-1", []byte(`{"kind":"old","body":"stale searchable"}`), "", 1*time.Second); err != nil {
		t.Fatalf("PutDocumentWithTTL: %v", err)
	}
	if err := db.SetSchema("testdb", "items", []byte(`{"type":"object","required":["kind"]}`)); err != nil {
		t.Fatalf("SetSchema: %v", err)
	}
	if _, err := db.SetWebhooks("testdb", "items", []WebhookConfig{{URL: "https://example.com/hook", Events: []string{"insert"}}}); err != nil {
		t.Fatalf("SetWebhooks: %v", err)
	}

	if err := db.DeleteCollection("testdb", "items"); err != nil {
		t.Fatalf("DeleteCollection: %v", err)
	}
	if _, err := db.CreateCollection("testdb", "items"); err != nil {
		t.Fatalf("recreate collection: %v", err)
	}
	if _, err := db.PutDocument("testdb", "items", "item-1", []byte(`{"body":"fresh"}`), ""); err != nil {
		t.Fatalf("PutDocument after recreate should not inherit schema: %v", err)
	}

	schema, err := db.GetSchema("testdb", "items")
	if err != nil {
		t.Fatalf("GetSchema: %v", err)
	}
	if schema != nil {
		t.Fatalf("expected schema metadata to be deleted, got %s", schema)
	}
	webhooks, err := db.GetWebhooks("testdb", "items")
	if err != nil {
		t.Fatalf("GetWebhooks: %v", err)
	}
	if webhooks != nil {
		t.Fatalf("expected webhook metadata to be deleted, got %#v", webhooks)
	}
	indexes, err := db.ListIndexes("testdb", "items")
	if err != nil {
		t.Fatalf("ListIndexes: %v", err)
	}
	if len(indexes) != 0 {
		t.Fatalf("expected index metadata to be deleted, got %v", indexes)
	}
	results, err := db.SearchFTS("testdb", "items", "searchable")
	if err != nil {
		t.Fatalf("SearchFTS: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected FTS metadata to be deleted, got %v", results)
	}

	time.Sleep(2 * time.Second)
	if err := db.purgeExpiredDocuments(); err != nil && !errors.Is(err, ErrNotFound) {
		t.Fatalf("purgeExpiredDocuments: %v", err)
	}
	if _, err := db.GetDocument("testdb", "items", "item-1"); err != nil {
		t.Fatalf("recreated document was affected by stale TTL metadata: %v", err)
	}
}
