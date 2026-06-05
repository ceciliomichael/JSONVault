package store

import (
	"fmt"
	"strings"
)

const maxNameLength = 128

func ValidateCollectionName(name string) error {
	if err := validateSegment("collection", name); err != nil {
		return err
	}
	if strings.EqualFold(name, "collections") {
		return fmt.Errorf("%w: %q is used by the collection management API", ErrReservedName, name)
	}
	return nil
}

func ValidateDocumentID(id string) error {
	return validateSegment("document id", id)
}

func validateSegment(kind, value string) error {
	if value == "" {
		return fmt.Errorf("%w: %s cannot be empty", ErrInvalidName, kind)
	}
	if len(value) > maxNameLength {
		return fmt.Errorf("%w: %s cannot exceed %d bytes", ErrInvalidName, kind, maxNameLength)
	}
	if value == "." || value == ".." || strings.Contains(value, "..") {
		return fmt.Errorf("%w: %s cannot contain path traversal", ErrInvalidName, kind)
	}

	for i, r := range value {
		valid := (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' ||
			r == '-' ||
			r == '.'
		if !valid {
			return fmt.Errorf("%w: %s contains unsupported character %q", ErrInvalidName, kind, r)
		}
		if i == 0 && !(r >= 'a' && r <= 'z') && !(r >= 'A' && r <= 'Z') && !(r >= '0' && r <= '9') {
			return fmt.Errorf("%w: %s must start with a letter or number", ErrInvalidName, kind)
		}
	}
	return nil
}
