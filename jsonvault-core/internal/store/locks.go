package store

import (
	"hash/fnv"
	"sync"
)

const numLocks = 256

type LockManager struct {
	locks [numLocks]*sync.RWMutex
}

func NewLockManager() *LockManager {
	m := &LockManager{}
	for i := 0; i < numLocks; i++ {
		m.locks[i] = &sync.RWMutex{}
	}
	return m
}

func (m *LockManager) getLock(key string) *sync.RWMutex {
	h := fnv.New32a()
	h.Write([]byte(key))
	return m.locks[h.Sum32()%numLocks]
}

func (m *LockManager) ForCollection(database, collection string) *sync.RWMutex {
	key := database + "/" + collection
	return m.getLock(key)
}

func (m *LockManager) ForDocument(database, collection, id string) *sync.RWMutex {
	key := database + "/" + collection + "/" + id
	return m.getLock(key)
}
