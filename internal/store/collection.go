package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

func (s *Store) CreateCollection(database, collection string) (bool, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return false, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return false, err
	}

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

	dbPath := filepath.Join(s.root, database)
	if err := os.MkdirAll(dbPath, 0o700); err != nil {
		return false, fmt.Errorf("create database: %w", err)
	}

	path := filepath.Join(s.root, database, collection)
	_, statErr := os.Stat(path)
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return false, fmt.Errorf("inspect collection: %w", statErr)
	}
	if err := os.MkdirAll(path, 0o700); err != nil {
		return false, fmt.Errorf("create collection: %w", err)
	}
	return errors.Is(statErr, os.ErrNotExist), nil
}

func (s *Store) ListCollections(database string) ([]string, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(s.root, database)
	entries, err := os.ReadDir(dbPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("list collections: %w", err)
	}

	collections := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if err := ValidateCollectionName(name); err != nil {
			continue
		}
		collections = append(collections, name)
	}
	sort.Strings(collections)
	return collections, nil
}

func (s *Store) DeleteCollection(database, collection string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}

	lock := s.locks.For(database, collection)
	lock.Lock()
	defer lock.Unlock()

	path := filepath.Join(s.root, database, collection)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect collection: %w", err)
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("delete collection: %w", err)
	}
	s.cache.DeletePrefix(cachePrefix(database, collection))
	return nil
}
