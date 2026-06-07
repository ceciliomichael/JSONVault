//go:build !windows

package store

import (
	"fmt"

	"golang.org/x/sys/unix"
)

func checkFreeSpace(path string, requiredBytes int64) error {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return fmt.Errorf("check free space: %w", err)
	}
	available := int64(stat.Bavail) * int64(stat.Bsize)
	if available < requiredBytes {
		return fmt.Errorf("%w: need %d bytes, available %d bytes", ErrInsufficientStorage, requiredBytes, available)
	}
	return nil
}
