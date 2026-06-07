package store

import (
	"bytes"
	"encoding/binary"
	"time"

	bolt "go.etcd.io/bbolt"
)

const (
	ttlIndexBucketName = "__ttl_index__"
	ttlByDocBucketName = "__ttl_by_doc__"
)

func ttlIndexBucketKey() []byte {
	return []byte(ttlIndexBucketName)
}

func ttlByDocBucketKey() []byte {
	return []byte(ttlByDocBucketName)
}

func ttlDocKey(collection, id string) []byte {
	key := make([]byte, len(collection)+1+len(id))
	copy(key, collection)
	key[len(collection)] = 0
	copy(key[len(collection)+1:], id)
	return key
}

func parseTTLDocKey(key []byte) (collection, id string, ok bool) {
	idx := bytes.IndexByte(key, 0)
	if idx == -1 {
		return "", "", false
	}
	return string(key[:idx]), string(key[idx+1:]), true
}

func ttlIndexKey(expireAt uint64, collection, id string) []byte {
	docKey := ttlDocKey(collection, id)
	key := make([]byte, 8+len(docKey))
	binary.BigEndian.PutUint64(key[:8], expireAt)
	copy(key[8:], docKey)
	return key
}

func parseTTLIndexKey(key []byte) (expireAt uint64, collection, id string, ok bool) {
	if len(key) < 10 {
		return 0, "", "", false
	}
	collection, id, ok = parseTTLDocKey(key[8:])
	if !ok {
		return 0, "", "", false
	}
	return binary.BigEndian.Uint64(key[:8]), collection, id, true
}

func getDocumentTTLTx(tx *bolt.Tx, collection, id string) (uint64, bool) {
	ttlByDoc := tx.Bucket(ttlByDocBucketKey())
	if ttlByDoc == nil {
		return 0, false
	}
	data := ttlByDoc.Get(ttlDocKey(collection, id))
	if len(data) != 8 {
		return 0, false
	}
	return binary.BigEndian.Uint64(data), true
}

func setDocumentTTL(tx *bolt.Tx, collection, id string, expireIn time.Duration) error {
	if expireIn <= 0 {
		return clearDocumentTTL(tx, collection, id)
	}
	if err := clearDocumentTTL(tx, collection, id); err != nil {
		return err
	}

	ttlIndex, err := tx.CreateBucketIfNotExists(ttlIndexBucketKey())
	if err != nil {
		return err
	}
	ttlByDoc, err := tx.CreateBucketIfNotExists(ttlByDocBucketKey())
	if err != nil {
		return err
	}

	expireAt := uint64(time.Now().Add(expireIn).Unix())
	var expireAtData [8]byte
	binary.BigEndian.PutUint64(expireAtData[:], expireAt)

	if err := ttlByDoc.Put(ttlDocKey(collection, id), expireAtData[:]); err != nil {
		return err
	}
	return ttlIndex.Put(ttlIndexKey(expireAt, collection, id), []byte{})
}

func clearDocumentTTL(tx *bolt.Tx, collection, id string) error {
	ttlByDoc := tx.Bucket(ttlByDocBucketKey())
	if ttlByDoc == nil {
		return nil
	}

	docKey := ttlDocKey(collection, id)
	data := ttlByDoc.Get(docKey)
	if len(data) == 8 {
		expireAt := binary.BigEndian.Uint64(data)
		if ttlIndex := tx.Bucket(ttlIndexBucketKey()); ttlIndex != nil {
			if err := ttlIndex.Delete(ttlIndexKey(expireAt, collection, id)); err != nil {
				return err
			}
		}
	}
	return ttlByDoc.Delete(docKey)
}

func deleteTTLDocEntryTx(tx *bolt.Tx, collection, id string) error {
	ttlByDoc := tx.Bucket(ttlByDocBucketKey())
	if ttlByDoc == nil {
		return nil
	}
	return ttlByDoc.Delete(ttlDocKey(collection, id))
}

func deleteTTLForCollectionTx(tx *bolt.Tx, collection string) error {
	if ttlIndex := tx.Bucket(ttlIndexBucketKey()); ttlIndex != nil {
		c := ttlIndex.Cursor()
		for k, _ := c.First(); k != nil; k, _ = c.Next() {
			_, keyCollection, _, ok := parseTTLIndexKey(k)
			if ok && keyCollection == collection {
				if err := c.Delete(); err != nil {
					return err
				}
			}
		}
	}

	ttlByDoc := tx.Bucket(ttlByDocBucketKey())
	if ttlByDoc == nil {
		return nil
	}
	c := ttlByDoc.Cursor()
	for k, _ := c.First(); k != nil; k, _ = c.Next() {
		keyCollection, _, ok := parseTTLDocKey(k)
		if ok && keyCollection == collection {
			if err := c.Delete(); err != nil {
				return err
			}
		}
	}
	return nil
}
