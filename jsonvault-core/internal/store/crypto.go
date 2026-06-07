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
var ErrPlaintextNotAllowed = errors.New("plaintext document is not allowed when encryption is required")

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
func decryptDocument(data []byte, key []byte, encryptionRequired ...bool) ([]byte, error) {
	plaintext, _, err := decryptDocumentOwned(data, key, encryptionRequired...)
	return plaintext, err
}

func decryptDocumentOwned(data []byte, key []byte, encryptionRequired ...bool) ([]byte, bool, error) {
	if len(data) == 0 {
		return data, false, nil
	}

	if data[0] != 0x00 {
		if len(encryptionRequired) > 0 && encryptionRequired[0] {
			return nil, false, ErrPlaintextNotAllowed
		}
		return data, false, nil // Plaintext JSON (e.g. legacy data or encryption disabled)
	}

	if len(key) != 32 {
		return nil, false, ErrMissingEncryptionKey
	}

	data = data[1:] // Strip magic byte

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, false, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, false, err
	}

	nonceSize := aesgcm.NonceSize()
	if len(data) < nonceSize {
		return nil, false, ErrInvalidCiphertext
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, false, ErrInvalidCiphertext
	}

	return plaintext, true, nil
}

func stableDocumentBytes(data []byte, owned bool) []byte {
	if owned {
		return data
	}
	clone := make([]byte, len(data))
	copy(clone, data)
	return clone
}
