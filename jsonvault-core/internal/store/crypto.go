package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
)

var ErrInvalidCiphertext = errors.New("invalid ciphertext or tampered document")
var ErrMissingEncryptionKey = errors.New("document is encrypted but no encryption key provided")

// encryptDocument encrypts plaintext using AES-GCM.
// It prepends a 0x00 magic byte to distinguish from plaintext JSON.
func encryptDocument(plaintext []byte, key []byte) ([]byte, error) {
	if len(key) != 32 {
		return plaintext, nil
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesgcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := aesgcm.Seal(nil, nonce, plaintext, nil)
	
	result := make([]byte, 1+len(nonce)+len(ciphertext))
	result[0] = 0x00
	copy(result[1:], nonce)
	copy(result[1+len(nonce):], ciphertext)
	return result, nil
}

// decryptDocument decrypts ciphertext using AES-GCM.
// It checks for the 0x00 magic byte to seamlessly support legacy plaintext documents.
func decryptDocument(data []byte, key []byte) ([]byte, error) {
	if len(data) == 0 {
		return data, nil
	}
	
	if data[0] != 0x00 {
		return data, nil // Plaintext JSON (e.g. legacy data or encryption disabled)
	}

	if len(key) != 32 {
		return nil, ErrMissingEncryptionKey
	}

	data = data[1:] // Strip magic byte

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesgcm.NonceSize()
	if len(data) < nonceSize {
		return nil, ErrInvalidCiphertext
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrInvalidCiphertext
	}

	return plaintext, nil
}
