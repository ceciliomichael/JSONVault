package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"jsonvault/internal/store"

	bolt "go.etcd.io/bbolt"
)

func runRestore(args []string) error {
	fs := flag.NewFlagSet("restore", flag.ContinueOnError)
	dataDir := fs.String("data-dir", "./data", "JSONVault data directory")
	database := fs.String("database", "", "database name to restore")
	backupPath := fs.String("backup", "", "path to backup .db file")
	force := fs.Bool("force", false, "replace existing database file")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *database == "" || *backupPath == "" {
		return fmt.Errorf("restore requires -database and -backup")
	}
	if err := store.ValidateDatabaseName(*database); err != nil {
		return err
	}
	if err := verifyBoltFile(*backupPath); err != nil {
		return fmt.Errorf("verify backup: %w", err)
	}
	if err := os.MkdirAll(*dataDir, 0o700); err != nil {
		return fmt.Errorf("create data directory: %w", err)
	}

	target := filepath.Join(*dataDir, *database+".db")
	if _, err := os.Stat(target); err == nil && !*force {
		return fmt.Errorf("%s already exists; pass -force to replace it while JSONVault is stopped", target)
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("inspect target: %w", err)
	}

	tmp, err := os.CreateTemp(*dataDir, *database+"-restore-*.db")
	if err != nil {
		return fmt.Errorf("create restore temp file: %w", err)
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	src, err := os.Open(*backupPath)
	if err != nil {
		_ = tmp.Close()
		return fmt.Errorf("open backup: %w", err)
	}
	if _, err := io.Copy(tmp, src); err != nil {
		_ = src.Close()
		_ = tmp.Close()
		return fmt.Errorf("copy backup: %w", err)
	}
	if err := src.Close(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("close backup: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync restore temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close restore temp file: %w", err)
	}
	if *force {
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove existing database: %w", err)
		}
	}
	if err := os.Rename(tmpPath, target); err != nil {
		return fmt.Errorf("replace database: %w", err)
	}
	cleanup = false
	return nil
}

func verifyBoltFile(path string) error {
	db, err := bolt.Open(path, 0o600, &bolt.Options{ReadOnly: true, Timeout: time.Second})
	if err != nil {
		return err
	}
	defer db.Close()
	return db.View(func(*bolt.Tx) error { return nil })
}
