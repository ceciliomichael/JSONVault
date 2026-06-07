package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

const maxTrackedOperations = 1024
const maxAuditRecords = 1024

type operationState string

const (
	operationQueued    operationState = "queued"
	operationRunning   operationState = "running"
	operationReady     operationState = "ready"
	operationFailed    operationState = "failed"
	operationCanceling operationState = "canceling"
	operationCanceled  operationState = "canceled"
)

type operationRecord struct {
	ID          string         `json:"operation_id"`
	Type        string         `json:"type"`
	Database    string         `json:"database"`
	Collection  string         `json:"collection,omitempty"`
	Field       string         `json:"field,omitempty"`
	State       operationState `json:"state"`
	Progress    float64        `json:"progress"`
	Actor       string         `json:"actor"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	LastError   string         `json:"last_error,omitempty"`
	Cancellable bool           `json:"cancellable"`

	cancel context.CancelFunc
}

type operationTracker struct {
	mu    sync.RWMutex
	ops   map[string]*operationRecord
	order []string
}

func newOperationTracker() *operationTracker {
	return &operationTracker{ops: make(map[string]*operationRecord)}
}

func (t *operationTracker) start(opType, database, collection, field, actor string, cancellable bool) (operationRecord, context.Context) {
	id := randomID("op")
	now := time.Now().UTC()
	ctx := context.Background()
	var cancel context.CancelFunc
	if cancellable {
		ctx, cancel = context.WithCancel(ctx)
	}
	record := &operationRecord{
		ID:          id,
		Type:        opType,
		Database:    database,
		Collection:  collection,
		Field:       field,
		State:       operationQueued,
		Progress:    0,
		Actor:       actor,
		CreatedAt:   now,
		UpdatedAt:   now,
		Cancellable: cancellable,
		cancel:      cancel,
	}
	t.mu.Lock()
	t.ops[id] = record
	t.order = append(t.order, id)
	for len(t.order) > maxTrackedOperations {
		evict := t.order[0]
		t.order = t.order[1:]
		delete(t.ops, evict)
	}
	snapshot := *record
	t.mu.Unlock()
	return snapshot, ctx
}

func (t *operationTracker) markRunning(id string) {
	t.update(id, func(record *operationRecord) {
		if record.State == operationQueued {
			record.State = operationRunning
			record.UpdatedAt = time.Now().UTC()
		}
	})
}

func (t *operationTracker) finish(id string, err error) {
	t.update(id, func(record *operationRecord) {
		record.UpdatedAt = time.Now().UTC()
		if err != nil {
			if record.State == operationCanceling {
				record.State = operationCanceled
			} else {
				record.State = operationFailed
			}
			record.LastError = err.Error()
			return
		}
		record.State = operationReady
		record.Progress = 1
		record.LastError = ""
	})
}

func (t *operationTracker) cancel(id string) (operationRecord, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	record, ok := t.ops[id]
	if !ok {
		return operationRecord{}, false
	}
	if record.cancel != nil && (record.State == operationQueued || record.State == operationRunning) {
		record.State = operationCanceling
		record.UpdatedAt = time.Now().UTC()
		record.cancel()
	}
	snapshot := *record
	snapshot.cancel = nil
	return snapshot, true
}

func (t *operationTracker) get(id string) (operationRecord, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	record, ok := t.ops[id]
	if !ok {
		return operationRecord{}, false
	}
	snapshot := *record
	snapshot.cancel = nil
	return snapshot, true
}

func (t *operationTracker) list() []operationRecord {
	t.mu.RLock()
	defer t.mu.RUnlock()
	records := make([]operationRecord, 0, len(t.ops))
	for _, id := range t.order {
		if record, ok := t.ops[id]; ok {
			snapshot := *record
			snapshot.cancel = nil
			records = append(records, snapshot)
		}
	}
	sort.Slice(records, func(i, j int) bool {
		return records[i].CreatedAt.After(records[j].CreatedAt)
	})
	return records
}

func (t *operationTracker) update(id string, update func(*operationRecord)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	record, ok := t.ops[id]
	if !ok {
		return
	}
	update(record)
}

type auditRecord struct {
	ID         string    `json:"id"`
	Actor      string    `json:"actor"`
	Action     string    `json:"action"`
	Database   string    `json:"database"`
	Collection string    `json:"collection,omitempty"`
	Target     string    `json:"target,omitempty"`
	Status     string    `json:"status"`
	Error      string    `json:"error,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type auditLog struct {
	mu      sync.RWMutex
	records []auditRecord
}

func newAuditLog() *auditLog {
	return &auditLog{}
}

func (l *auditLog) append(record auditRecord) {
	record.ID = randomID("audit")
	record.CreatedAt = time.Now().UTC()
	l.mu.Lock()
	l.records = append(l.records, record)
	if len(l.records) > maxAuditRecords {
		copy(l.records, l.records[len(l.records)-maxAuditRecords:])
		l.records = l.records[:maxAuditRecords]
	}
	l.mu.Unlock()
}

func (l *auditLog) list() []auditRecord {
	l.mu.RLock()
	defer l.mu.RUnlock()
	records := make([]auditRecord, len(l.records))
	copy(records, l.records)
	sort.Slice(records, func(i, j int) bool {
		return records[i].CreatedAt.After(records[j].CreatedAt)
	})
	return records
}

func (s *Server) handleGetOperation(c *gin.Context) {
	record, ok := s.operations.get(c.Param("operation_id"))
	if !ok {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "operation not found"}})
		return
	}
	if !s.hasCapabilityFor(c, auth.CapabilityOperationsRead, record.Database, record.Collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "operations:read capability required"})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (s *Server) handleListOperations(c *gin.Context) {
	records := s.operations.list()
	visible := make([]operationRecord, 0, len(records))
	for _, record := range records {
		if s.hasCapabilityFor(c, auth.CapabilityOperationsRead, record.Database, record.Collection) {
			visible = append(visible, record)
		}
	}
	c.JSON(http.StatusOK, gin.H{"operations": visible})
}

func (s *Server) handleCancelOperation(c *gin.Context) {
	record, ok := s.operations.get(c.Param("operation_id"))
	if !ok {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "operation not found"}})
		return
	}
	if !s.hasCapabilityFor(c, auth.CapabilityOperationsCancel, record.Database, record.Collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "operations:cancel capability required"})
		return
	}
	updated, _ := s.operations.cancel(record.ID)
	c.JSON(http.StatusAccepted, updated)
}

func (s *Server) handleListAudit(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) && !contextHasCapability(c, auth.CapabilityOperationsRead) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "operations:read capability required"})
		return
	}
	records := s.audit.list()
	visible := make([]auditRecord, 0, len(records))
	for _, record := range records {
		if s.hasCapabilityFor(c, auth.CapabilityOperationsRead, record.Database, record.Collection) {
			visible = append(visible, record)
		}
	}
	c.JSON(http.StatusOK, gin.H{"audit": visible})
}

func randomID(prefix string) string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return prefix + "_" + hex.EncodeToString([]byte(time.Now().UTC().Format("20060102150405.000000000")))
	}
	return prefix + "_" + hex.EncodeToString(buf[:])
}
