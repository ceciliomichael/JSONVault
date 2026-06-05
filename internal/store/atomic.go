package store

import (
	"fmt"
	"os"
	"path/filepath"
)

func writeAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	temp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp document: %w", err)
	}

	tempName := temp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tempName)
		}
	}()

	if _, err := temp.Write(data); err != nil {
		_ = temp.Close()
		return fmt.Errorf("write temp document: %w", err)
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return fmt.Errorf("sync temp document: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("close temp document: %w", err)
	}
	if err := os.Rename(tempName, path); err != nil {
		return fmt.Errorf("commit document: %w", err)
	}
	cleanup = false
	syncDir(dir)
	return nil
}

func syncDir(dir string) {
	handle, err := os.Open(dir)
	if err != nil {
		return
	}
	defer handle.Close()
	_ = handle.Sync()
}
