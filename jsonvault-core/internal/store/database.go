package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Store) CreateDatabase(name string) (bool, error) {
	if err := ValidateDatabaseName(name); err != nil {
		return false, err
	}

	path := filepath.Join(s.root, name+".db")
	_, statErr := os.Stat(path)
	created := errors.Is(statErr, os.ErrNotExist)

	// getDB will create the file via bolt.Open if it doesn't exist
	_, err := s.getDB(name)
	if err != nil {
		return false, err
	}

	return created, nil
}

func (s *Store) ListDatabases() ([]string, error) {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		return nil, fmt.Errorf("list databases: %w", err)
	}

	databases := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if !strings.HasSuffix(entry.Name(), ".db") {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), ".db")
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

	path := filepath.Join(s.root, name+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect database: %w", err)
	}

	s.mu.Lock()
	if db, ok := s.dbs[name]; ok {
		db.Close()
		delete(s.dbs, name)
	}
	s.mu.Unlock()

	if err := os.Remove(path); err != nil {
		return fmt.Errorf("delete database: %w", err)
	}
	return nil
}
