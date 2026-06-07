package store

import (
	"bytes"
	"crypto/rand"
	"errors"
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

func TestDecryptDocumentRejectsPlaintextWhenEncryptionRequired(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}

	_, err := decryptDocument([]byte(`{"legacy":true}`), key, true)
	if !errors.Is(err, ErrPlaintextNotAllowed) {
		t.Fatalf("expected ErrPlaintextNotAllowed, got %v", err)
	}
}

func TestStoreEncryptionRequiredRejectsLegacyPlaintext(t *testing.T) {
	root := t.TempDir()
	legacy, err := New(root, 8, nil)
	if err != nil {
		t.Fatalf("New legacy: %v", err)
	}
	if _, err := legacy.PutDocument("testdb", "items", "a", []byte(`{"legacy":true}`), ""); err != nil {
		t.Fatalf("PutDocument legacy: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("legacy Close: %v", err)
	}

	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	secure, err := NewWithOptions(root, 8, key, Options{EncryptionRequired: true})
	if err != nil {
		t.Fatalf("NewWithOptions secure: %v", err)
	}
	defer secure.Close()

	_, err = secure.GetDocument("testdb", "items", "a")
	if !errors.Is(err, ErrPlaintextNotAllowed) {
		t.Fatalf("expected ErrPlaintextNotAllowed, got %v", err)
	}
}

func TestStoreEncryptionRequiredNeedsValidKey(t *testing.T) {
	if _, err := NewWithOptions(t.TempDir(), 8, nil, Options{EncryptionRequired: true}); err == nil {
		t.Fatal("expected missing key error")
	}
	if _, err := NewWithOptions(t.TempDir(), 8, []byte("short"), Options{EncryptionRequired: true}); err == nil {
		t.Fatal("expected short key error")
	}
}
