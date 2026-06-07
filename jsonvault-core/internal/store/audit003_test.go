package store

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestMaxDocumentBytesEnforcedOnDirectWrites(t *testing.T) {
	db, err := NewWithOptions(t.TempDir(), 8, nil, Options{MaxDocumentBytes: 32})
	if err != nil {
		t.Fatalf("NewWithOptions: %v", err)
	}
	defer db.Close()

	oversized := []byte(`{"value":"` + strings.Repeat("x", 64) + `"}`)
	if _, err := db.CreateDocument("testdb", "docs", oversized); !errors.Is(err, ErrDocumentTooLarge) {
		t.Fatalf("CreateDocument error = %v, want ErrDocumentTooLarge", err)
	}

	doc, err := db.CreateDocument("testdb", "docs", []byte(`{"value":"ok"}`))
	if err != nil {
		t.Fatalf("CreateDocument small: %v", err)
	}
	if _, err := db.PutDocument("testdb", "docs", doc.ID, oversized, ""); !errors.Is(err, ErrDocumentTooLarge) {
		t.Fatalf("PutDocument error = %v, want ErrDocumentTooLarge", err)
	}
	if _, err := db.PatchDocument("testdb", "docs", doc.ID, oversized, ""); !errors.Is(err, ErrDocumentTooLarge) {
		t.Fatalf("PatchDocument error = %v, want ErrDocumentTooLarge", err)
	}
	if _, err := db.ExecuteTransaction("testdb", []TransactionOp{{
		Action:     "put",
		Collection: "docs",
		ID:         "oversized",
		Body:       oversized,
	}}); !errors.Is(err, ErrDocumentTooLarge) {
		t.Fatalf("ExecuteTransaction error = %v, want ErrDocumentTooLarge", err)
	}
}

func TestListDocumentsEnforcesQueryBudgets(t *testing.T) {
	db, err := NewWithOptions(t.TempDir(), 8, nil, Options{
		MaxResponseBytes:  120,
		MaxQueryScanDocs:  2,
		MaxQueryScanBytes: 1024 * 1024,
	})
	if err != nil {
		t.Fatalf("NewWithOptions: %v", err)
	}
	defer db.Close()

	for i := 0; i < 5; i++ {
		if _, err := db.CreateDocument("testdb", "docs", []byte(`{"name":"`+strings.Repeat("x", 40)+`"}`)); err != nil {
			t.Fatalf("CreateDocument: %v", err)
		}
	}

	if _, _, err := db.ListDocuments(context.Background(), "testdb", "docs", 5, 0, nil, "", ""); !errors.Is(err, ErrQueryLimitExceeded) {
		t.Fatalf("response budget error = %v, want ErrQueryLimitExceeded", err)
	}
	if _, _, err := db.ListDocuments(context.Background(), "testdb", "docs", 1, 0, map[string]interface{}{"missing": "value"}, "", ""); !errors.Is(err, ErrQueryLimitExceeded) {
		t.Fatalf("scan budget error = %v, want ErrQueryLimitExceeded", err)
	}
}

func TestBackupUsesConfiguredTempDirAndChecksFreeSpace(t *testing.T) {
	var checkedPath string
	db, err := NewWithOptions(t.TempDir(), 8, nil, Options{
		BackupTempDir: filepath.Join(t.TempDir(), "backup-tmp"),
		BackupFreeSpace: func(path string, requiredBytes int64) error {
			checkedPath = path
			return ErrInsufficientStorage
		},
	})
	if err != nil {
		t.Fatalf("NewWithOptions: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("testdb", "docs", []byte(`{"ok":true}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if err := db.BackupDatabase(context.Background(), "testdb", bytes.NewBuffer(nil)); !errors.Is(err, ErrInsufficientStorage) {
		t.Fatalf("BackupDatabase error = %v, want ErrInsufficientStorage", err)
	}
	if checkedPath != db.backupTempDir {
		t.Fatalf("free-space path = %q, want %q", checkedPath, db.backupTempDir)
	}
}

func TestBackupConcurrencyGuard(t *testing.T) {
	db, err := NewWithOptions(t.TempDir(), 8, nil, Options{BackupConcurrency: 1})
	if err != nil {
		t.Fatalf("NewWithOptions: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateDocument("testdb", "docs", []byte(`{"ok":true}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}

	writer := &blockingBackupWriter{started: make(chan struct{}), release: make(chan struct{})}
	done := make(chan error, 1)
	go func() {
		done <- db.BackupDatabase(context.Background(), "testdb", writer)
	}()
	<-writer.started

	if err := db.BackupDatabase(context.Background(), "testdb", bytes.NewBuffer(nil)); !errors.Is(err, ErrBackupInProgress) {
		close(writer.release)
		t.Fatalf("concurrent backup error = %v, want ErrBackupInProgress", err)
	}
	close(writer.release)
	if err := <-done; err != nil {
		t.Fatalf("first backup: %v", err)
	}
}

func TestCommittedEventsCanReplay(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	doc, err := db.CreateDocument("testdb", "docs", []byte(`{"ok":true}`))
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	events, err := db.ReplayEvents("testdb", "docs", 0, 100)
	if err != nil {
		t.Fatalf("ReplayEvents: %v", err)
	}
	if len(events) != 1 || events[0].Action != "insert" || events[0].DocumentID != doc.ID || events[0].Sequence == 0 {
		t.Fatalf("unexpected replay events: %#v", events)
	}
	events, err = db.ReplayEvents("testdb", "docs", events[0].Sequence, 100)
	if err != nil {
		t.Fatalf("ReplayEvents after sequence: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected no replay events after last sequence, got %#v", events)
	}
}
