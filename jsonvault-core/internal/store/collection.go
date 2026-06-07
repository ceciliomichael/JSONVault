package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	bolt "go.etcd.io/bbolt"
)

func (s *Store) CreateCollection(database, collection string) (bool, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return false, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return false, err
	}

	db, err := s.getDB(database)
	if err != nil {
		return false, err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	var created bool
	err = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			_, err := tx.CreateBucket([]byte(collection))
			if err != nil {
				return err
			}
			if err := putCollectionCountTx(tx, collection, 0); err != nil {
				return err
			}
			created = true
		}
		return nil
	})

	if err != nil {
		return false, fmt.Errorf("create collection: %w", err)
	}
	return created, nil
}

func (s *Store) ListCollections(database string) ([]string, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	var collections []string
	err = db.View(func(tx *bolt.Tx) error {
		return tx.ForEach(func(name []byte, _ *bolt.Bucket) error {
			collectionName := string(name)
			if isInternalBucketName(collectionName) {
				return nil
			}
			collections = append(collections, collectionName)
			return nil
		})
	})
	if err != nil {
		return nil, fmt.Errorf("list collections: %w", err)
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

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	unlock := s.lockDatabaseWrite(database)
	defer unlock()

	err = db.Update(func(tx *bolt.Tx) error {
		if tx.Bucket([]byte(collection)) == nil {
			return ErrNotFound
		}

		// Clean up index buckets
		indexes := getWritableIndexFieldsTx(tx, collection)
		for _, field := range indexes {
			idxBucketName := getIndexBucketName(collection, field)
			if tx.Bucket(idxBucketName) != nil {
				if err := tx.DeleteBucket(idxBucketName); err != nil {
					return err
				}
			}
		}

		// Clean up index metadata
		metaBucket := tx.Bucket(getIndexesMetaBucketName())
		if metaBucket != nil {
			if err := metaBucket.Delete([]byte(collection)); err != nil {
				return err
			}
		}
		if err := deleteIndexBuildMetadataForCollectionTx(tx, collection); err != nil {
			return err
		}

		if err := deleteSchemaTx(tx, collection); err != nil {
			return err
		}
		if err := deleteWebhooksTx(tx, collection); err != nil {
			return err
		}
		if err := deleteFTSForCollectionTx(tx, collection); err != nil {
			return err
		}
		if err := deleteTTLForCollectionTx(tx, collection); err != nil {
			return err
		}
		if err := deleteCollectionCountTx(tx, collection); err != nil {
			return err
		}

		return tx.DeleteBucket([]byte(collection))
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete collection: %w", err)
	}
	s.invalidateSchemaCache(database, collection)
	return nil
}
