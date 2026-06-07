package main

import (
	"os"
	"path/filepath"
	"testing"

	"jsonvault/internal/store"
)

func TestRunRestoreCopiesVerifiedBackup(t *testing.T) {
	sourceDir := t.TempDir()
	db, err := store.New(sourceDir, 8, nil)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	if _, err := db.CreateDocument("app", "docs", []byte(`{"ok":true}`)); err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	targetDir := t.TempDir()
	backupPath := filepath.Join(sourceDir, "app.db")
	if err := runRestore([]string{"-data-dir", targetDir, "-database", "app", "-backup", backupPath}); err != nil {
		t.Fatalf("runRestore: %v", err)
	}
	if _, err := os.Stat(filepath.Join(targetDir, "app.db")); err != nil {
		t.Fatalf("restored database missing: %v", err)
	}
	if err := runRestore([]string{"-data-dir", targetDir, "-database", "app", "-backup", backupPath}); err == nil {
		t.Fatal("expected restore without -force to reject existing target")
	}
	if err := runRestore([]string{"-data-dir", targetDir, "-database", "app", "-backup", backupPath, "-force"}); err != nil {
		t.Fatalf("runRestore force: %v", err)
	}
}
