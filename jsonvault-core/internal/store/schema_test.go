package store

import (
	stdjson "encoding/json"
	"testing"
	"time"
)

func closeStoreAfterAsyncEvents(t *testing.T, db *Store) {
	t.Helper()
	time.Sleep(50 * time.Millisecond)
	if err := db.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestPatchWithSchemaDoesNotDeadlock(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateCollection("testdb", "users"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if err := db.SetSchema("testdb", "users", []byte(`{"type":"object","properties":{"age":{"type":"integer"}},"required":["age"]}`)); err != nil {
		t.Fatalf("SetSchema: %v", err)
	}
	doc, err := db.CreateDocument("testdb", "users", []byte(`{"age":30}`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		_, err := db.PatchDocument("testdb", "users", doc.ID, []byte(`{"age":31}`), doc.ETag)
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("PatchDocument: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("PatchDocument deadlocked with schema validation")
	}
}

func TestTransactionWithSchemaDoesNotDeadlock(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closeStoreAfterAsyncEvents(t, db)

	if _, err := db.CreateCollection("testdb", "users"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if err := db.SetSchema("testdb", "users", []byte(`{"type":"object","properties":{"age":{"type":"integer"}},"required":["age"]}`)); err != nil {
		t.Fatalf("SetSchema: %v", err)
	}
	doc, err := db.CreateDocument("testdb", "users", []byte(`{"age":30}`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		_, err := db.ExecuteTransaction("testdb", []TransactionOp{
			{
				Action:       "patch",
				Collection:   "users",
				ID:           doc.ID,
				Body:         stdjson.RawMessage(`{"age":31}`),
				ExpectedETag: doc.ETag,
			},
			{
				Action:     "put",
				Collection: "users",
				ID:         "new-user",
				Body:       stdjson.RawMessage(`{"age":18}`),
			},
		})
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("ExecuteTransaction: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("ExecuteTransaction deadlocked with schema validation")
	}
}

func TestSetSchemaRejectsInvalidSchema(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateCollection("testdb", "users"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if err := db.SetSchema("testdb", "users", []byte(`{"type": 1}`)); err == nil {
		t.Fatal("expected invalid schema error")
	}
}
