package store

import (
	"encoding/binary"
	"strings"

	bolt "go.etcd.io/bbolt"
)

const collectionMetaBucketName = "_collections_meta"

func getCollectionMetaBucketName() []byte {
	return []byte(collectionMetaBucketName)
}

func isInternalBucketName(name string) bool {
	return strings.HasPrefix(name, "_")
}

func getCollectionCountTx(tx *bolt.Tx, collection string, collectionBucket *bolt.Bucket) int {
	metaBucket := tx.Bucket(getCollectionMetaBucketName())
	if metaBucket == nil {
		return collectionBucket.Stats().KeyN
	}

	data := metaBucket.Get([]byte(collection))
	if len(data) != 8 {
		return collectionBucket.Stats().KeyN
	}

	return int(binary.BigEndian.Uint64(data))
}

func putCollectionCountTx(tx *bolt.Tx, collection string, count int) error {
	if count < 0 {
		count = 0
	}

	metaBucket, err := tx.CreateBucketIfNotExists(getCollectionMetaBucketName())
	if err != nil {
		return err
	}

	var data [8]byte
	binary.BigEndian.PutUint64(data[:], uint64(count))
	return metaBucket.Put([]byte(collection), data[:])
}

func incrementCollectionCountTx(tx *bolt.Tx, collection string, delta int, collectionBucket *bolt.Bucket) error {
	count := getCollectionCountTx(tx, collection, collectionBucket)
	return putCollectionCountTx(tx, collection, count+delta)
}

func deleteCollectionCountTx(tx *bolt.Tx, collection string) error {
	metaBucket := tx.Bucket(getCollectionMetaBucketName())
	if metaBucket == nil {
		return nil
	}
	return metaBucket.Delete([]byte(collection))
}
