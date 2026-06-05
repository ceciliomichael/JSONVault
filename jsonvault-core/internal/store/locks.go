package store

import "sync"

type LockManager struct {
	locks sync.Map
}

func NewLockManager() *LockManager {
	return &LockManager{}
}

func (m *LockManager) ForCollection(database, collection string) *sync.RWMutex {
	key := database + "/" + collection
	lock, _ := m.locks.LoadOrStore(key, &sync.RWMutex{})
	return lock.(*sync.RWMutex)
}

func (m *LockManager) ForDocument(database, collection, id string) *sync.RWMutex {
	key := database + "/" + collection + "/" + id
	lock, _ := m.locks.LoadOrStore(key, &sync.RWMutex{})
	return lock.(*sync.RWMutex)
}
