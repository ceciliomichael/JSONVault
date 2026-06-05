package store

import (
	"bytes"
	"crypto/rand"
	"testing"
)

func TestCrypto(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)

	plaintext := []byte(`{"hello":"world"}`)

	// Test Encryption
	ciphertext, err := encryptDocument(plaintext, key)
	if err != nil {
		t.Fatalf("encryptDocument failed: %v", err)
	}

	if bytes.Equal(ciphertext, plaintext) {
		t.Fatalf("ciphertext should not match plaintext")
	}
	if ciphertext[0] != 0x00 {
		t.Fatalf("ciphertext should start with magic byte 0x00")
	}

	// Test Decryption
	decrypted, err := decryptDocument(ciphertext, key)
	if err != nil {
		t.Fatalf("decryptDocument failed: %v", err)
	}

	if !bytes.Equal(decrypted, plaintext) {
		t.Fatalf("decrypted %s != plaintext %s", string(decrypted), string(plaintext))
	}

	// Test Legacy Plaintext behavior
	legacyData := []byte(`{"old":"data"}`)
	decryptedLegacy, err := decryptDocument(legacyData, key)
	if err != nil {
		t.Fatalf("decryptDocument legacy failed: %v", err)
	}
	if !bytes.Equal(decryptedLegacy, legacyData) {
		t.Fatalf("legacy data should not be modified")
	}

	// Test Wrong Key
	wrongKey := make([]byte, 32)
	rand.Read(wrongKey)
	_, err = decryptDocument(ciphertext, wrongKey)
	if err != ErrInvalidCiphertext {
		t.Fatalf("expected ErrInvalidCiphertext, got %v", err)
	}

	// Test Tampering
	ciphertext[5] ^= 0xFF
	_, err = decryptDocument(ciphertext, key)
	if err != ErrInvalidCiphertext {
		t.Fatalf("expected ErrInvalidCiphertext after tampering, got %v", err)
	}
}
