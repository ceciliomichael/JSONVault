package store

import (
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
)

type dbState int

const (
	stateActive dbState = iota
	stateDeleting
)

type DBHandle struct {
	db       *bolt.DB
	state    dbState
	gate     sync.RWMutex
	mu       sync.RWMutex
	lastUsed time.Time
}

func (h *DBHandle) View(fn func(*bolt.Tx) error) error {
	h.mu.RLock()
	if h.state == stateDeleting {
		h.mu.RUnlock()
		return ErrNotFound
	}
	h.gate.RLock()
	h.mu.RUnlock()
	
	defer h.gate.RUnlock()
	return h.db.View(fn)
}

func (h *DBHandle) Update(fn func(*bolt.Tx) error) error {
	h.mu.RLock()
	if h.state == stateDeleting {
		h.mu.RUnlock()
		return ErrNotFound
	}
	h.gate.RLock()
	h.mu.RUnlock()
	
	defer h.gate.RUnlock()
	return h.db.Update(fn)
}
