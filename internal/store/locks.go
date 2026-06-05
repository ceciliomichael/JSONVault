package store

import "sync"

type LockManager struct {
	locks sync.Map
}

func NewLockManager() *LockManager {
	return &LockManager{}
}

func (m *LockManager) For(collection string) *sync.RWMutex {
	lock, _ := m.locks.LoadOrStore(collection, &sync.RWMutex{})
	return lock.(*sync.RWMutex)
}
