package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

func (s *Store) CreateDatabase(name string) (bool, error) {
	if err := ValidateDatabaseName(name); err != nil {
		return false, err
	}

	path := filepath.Join(s.root, name)
	_, statErr := os.Stat(path)
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return false, fmt.Errorf("inspect database: %w", statErr)
	}
	if err := os.MkdirAll(path, 0o700); err != nil {
		return false, fmt.Errorf("create database: %w", err)
	}
	return errors.Is(statErr, os.ErrNotExist), nil
}

func (s *Store) ListDatabases() ([]string, error) {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		return nil, fmt.Errorf("list databases: %w", err)
	}

	databases := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if err := ValidateDatabaseName(name); err != nil {
			continue
		}
		databases = append(databases, name)
	}
	sort.Strings(databases)
	return databases, nil
}

func (s *Store) DeleteDatabase(name string) error {
	if err := ValidateDatabaseName(name); err != nil {
		return err
	}

	path := filepath.Join(s.root, name)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect database: %w", err)
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("delete database: %w", err)
	}
	s.cache.DeletePrefix(name + "/")
	return nil
}
