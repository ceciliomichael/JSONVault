//go:build windows

package store

import (
	"fmt"

	"golang.org/x/sys/windows"
)

func checkFreeSpace(path string, requiredBytes int64) error {
	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return fmt.Errorf("check free space path: %w", err)
	}
	var freeBytes uint64
	if err := windows.GetDiskFreeSpaceEx(pathPtr, &freeBytes, nil, nil); err != nil {
		return fmt.Errorf("check free space: %w", err)
	}
	if freeBytes < uint64(requiredBytes) {
		return fmt.Errorf("%w: need %d bytes, available %d bytes", ErrInsufficientStorage, requiredBytes, freeBytes)
	}
	return nil
}
