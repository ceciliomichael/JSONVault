package store

import "errors"

var (
	ErrInvalidName         = errors.New("invalid name")
	ErrReservedName        = errors.New("reserved collection name")
	ErrInvalidJSON         = errors.New("invalid json")
	ErrEmptyDocument       = errors.New("empty document")
	ErrNotFound            = errors.New("not found")
	ErrPreconditionFailed  = errors.New("precondition failed")
	ErrDocumentTooLarge    = errors.New("document exceeds maximum size")
	ErrQueryLimitExceeded  = errors.New("query exceeds configured resource limit")
	ErrBackupInProgress    = errors.New("backup already in progress")
	ErrInsufficientStorage = errors.New("insufficient storage for operation")
)
