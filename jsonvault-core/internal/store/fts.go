package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"

	bolt "go.etcd.io/bbolt"
)

var (
	ftsConfigBucket  = []byte("_fts_config")
	ftsIndexBucket   = []byte("_fts_index")
	ftsReverseBucket = []byte("_fts_reverse")
)

type FTSConfig struct {
	Fields []string `json:"fields"`
}

// SetFTSConfig enables Full-Text Search on specific fields for a collection.
func (s *Store) SetFTSConfig(database, collection string, fields []string) error {
	if err := ValidateDatabaseName(database); err != nil {
		return err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return err
	}
	if len(fields) == 0 {
		return fmt.Errorf("%w: at least one FTS field is required", ErrInvalidName)
	}
	for _, field := range fields {
		if err := ValidateFieldName(field); err != nil {
			return err
		}
	}

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	config := FTSConfig{Fields: fields}
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	return db.Update(func(tx *bolt.Tx) error {
		if err := deleteFTSForCollectionTx(tx, collection); err != nil {
			return err
		}

		b, err := tx.CreateBucketIfNotExists(ftsConfigBucket)
		if err != nil {
			return err
		}
		// Also create the index and reverse buckets so they are ready
		_, err = tx.CreateBucketIfNotExists(ftsIndexBucket)
		if err != nil {
			return err
		}
		_, err = tx.CreateBucketIfNotExists(ftsReverseBucket)
		if err != nil {
			return err
		}

		if err := b.Put([]byte(collection), data); err != nil {
			return err
		}

		colBucket := tx.Bucket([]byte(collection))
		if colBucket == nil {
			return nil
		}

		c := colBucket.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			plaintext, err := decryptDocument(v, s.encryptionKey, s.encryptionRequired)
			if err != nil {
				return fmt.Errorf("corrupt document (decrypt): %w", err)
			}
			var parsed map[string]interface{}
			if err := json.Unmarshal(plaintext, &parsed); err != nil {
				continue
			}
			if err := indexFTS(tx, collection, string(k), parsed); err != nil {
				return err
			}
		}

		return nil
	})
}

// GetFTSConfig retrieves the FTS configuration for a collection.
func (s *Store) GetFTSConfig(tx *bolt.Tx, collection string) (*FTSConfig, error) {
	return getFTSConfigTx(tx, collection)
}

func getFTSConfigTx(tx *bolt.Tx, collection string) (*FTSConfig, error) {
	b := tx.Bucket(ftsConfigBucket)
	if b == nil {
		return nil, nil
	}

	data := b.Get([]byte(collection))
	if data == nil {
		return nil, nil
	}

	var config FTSConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// tokenize extracts lowercase alphanumeric words from a string.
func tokenize(text string) []string {
	f := func(c rune) bool {
		return !unicode.IsLetter(c) && !unicode.IsNumber(c)
	}
	words := strings.FieldsFunc(text, f)

	// Deduplicate and lowercase
	uniqueWords := make(map[string]struct{})
	for _, w := range words {
		if len(w) > 1 { // Ignore single character words
			uniqueWords[strings.ToLower(w)] = struct{}{}
		}
	}

	var result []string
	for w := range uniqueWords {
		result = append(result, w)
	}
	return result
}

// extractText recursively pulls text out of JSON values based on the configured fields.
func extractText(doc map[string]interface{}, fields []string) string {
	var sb strings.Builder
	for _, field := range fields {
		if val, ok := doc[field]; ok {
			if str, isStr := val.(string); isStr {
				sb.WriteString(str)
				sb.WriteString(" ")
			}
		}
	}
	return sb.String()
}

// indexFTS adds a document to the inverted index.
func indexFTS(tx *bolt.Tx, collection, docID string, doc map[string]interface{}) error {
	config, err := getFTSConfigTx(tx, collection)
	if err != nil || config == nil || len(config.Fields) == 0 {
		return err
	}

	text := extractText(doc, config.Fields)
	tokens := tokenize(text)
	if len(tokens) == 0 {
		return nil
	}

	idxBucket := tx.Bucket(ftsIndexBucket)
	revBucket := tx.Bucket(ftsReverseBucket)

	if idxBucket == nil || revBucket == nil {
		return nil
	}

	// 1. Store reverse mapping (docID -> tokens)
	revKey := []byte(fmt.Sprintf("%s:%s", collection, docID))
	tokensData, _ := json.Marshal(tokens)
	if err := revBucket.Put(revKey, tokensData); err != nil {
		return err
	}

	// 2. Store forward mapping (token -> docID keys)
	for _, token := range tokens {
		tokenKey := []byte(fmt.Sprintf("%s:%s", collection, token))
		tokenBucket, err := getOrCreateFTSTokenBucket(idxBucket, tokenKey)
		if err != nil {
			return err
		}
		if err := tokenBucket.Put([]byte(docID), []byte{}); err != nil {
			return err
		}
	}

	return nil
}

// unindexFTS removes a document from the inverted index.
func unindexFTS(tx *bolt.Tx, collection, docID string) error {
	revBucket := tx.Bucket(ftsReverseBucket)
	idxBucket := tx.Bucket(ftsIndexBucket)

	if revBucket == nil || idxBucket == nil {
		return nil
	}

	revKey := []byte(fmt.Sprintf("%s:%s", collection, docID))
	existingTokens := revBucket.Get(revKey)
	if existingTokens == nil {
		return nil // Was never indexed
	}

	var tokens []string
	json.Unmarshal(existingTokens, &tokens)

	// 1. Remove from forward mapping
	for _, token := range tokens {
		tokenKey := []byte(fmt.Sprintf("%s:%s", collection, token))
		if tokenBucket := idxBucket.Bucket(tokenKey); tokenBucket != nil {
			if err := tokenBucket.Delete([]byte(docID)); err != nil {
				return err
			}
			if tokenBucket.Stats().KeyN == 0 {
				if err := idxBucket.DeleteBucket(tokenKey); err != nil {
					return err
				}
			}
			continue
		}

		if existing := idxBucket.Get(tokenKey); existing != nil {
			docIDs := removeStringFromJSONList(existing, docID)
			if len(docIDs) == 0 {
				if err := idxBucket.Delete(tokenKey); err != nil {
					return err
				}
				continue
			}
			newData, err := json.Marshal(docIDs)
			if err != nil {
				return err
			}
			if err := idxBucket.Put(tokenKey, newData); err != nil {
				return err
			}
		}
	}

	// 2. Remove reverse mapping
	return revBucket.Delete(revKey)
}

// searchFTS intersects token arrays to find documents matching the query.
func searchFTS(tx *bolt.Tx, collection, query string) []string {
	tokens := tokenize(query)
	if len(tokens) == 0 {
		return nil
	}

	idxBucket := tx.Bucket(ftsIndexBucket)
	if idxBucket == nil {
		return nil
	}

	postings := make([][]string, 0, len(tokens))

	for _, token := range tokens {
		tokenKey := []byte(fmt.Sprintf("%s:%s", collection, token))
		data := idxBucket.Get(tokenKey)

		if data == nil && idxBucket.Bucket(tokenKey) == nil {
			// If ANY token is missing, the intersection is empty!
			return []string{}
		}

		docIDs := getFTSDocIDs(idxBucket, tokenKey, data)
		if len(docIDs) == 0 {
			return []string{}
		}
		postings = append(postings, docIDs)
	}

	sort.Slice(postings, func(i, j int) bool {
		return len(postings[i]) < len(postings[j])
	})

	resultIDs := postings[0]
	for _, docIDs := range postings[1:] {
		candidates := make(map[string]struct{}, len(docIDs))
		for _, id := range docIDs {
			candidates[id] = struct{}{}
		}

		intersection := resultIDs[:0]
		for _, id := range resultIDs {
			if _, ok := candidates[id]; ok {
				intersection = append(intersection, id)
			}
		}
		resultIDs = intersection
		if len(resultIDs) == 0 {
			return []string{}
		}
	}

	return resultIDs
}

func getOrCreateFTSTokenBucket(idxBucket *bolt.Bucket, tokenKey []byte) (*bolt.Bucket, error) {
	tokenBucket, err := idxBucket.CreateBucketIfNotExists(tokenKey)
	if err == nil {
		return tokenBucket, nil
	}
	if !errors.Is(err, bolt.ErrIncompatibleValue) {
		return nil, err
	}

	var legacyDocIDs []string
	if existing := idxBucket.Get(tokenKey); existing != nil {
		_ = json.Unmarshal(existing, &legacyDocIDs)
		if err := idxBucket.Delete(tokenKey); err != nil {
			return nil, err
		}
	}

	tokenBucket, err = idxBucket.CreateBucket(tokenKey)
	if err != nil {
		return nil, err
	}
	for _, id := range legacyDocIDs {
		if err := tokenBucket.Put([]byte(id), []byte{}); err != nil {
			return nil, err
		}
	}
	return tokenBucket, nil
}

func getFTSDocIDs(idxBucket *bolt.Bucket, tokenKey []byte, legacyData []byte) []string {
	if tokenBucket := idxBucket.Bucket(tokenKey); tokenBucket != nil {
		docIDs := make([]string, 0, tokenBucket.Stats().KeyN)
		_ = tokenBucket.ForEach(func(k, _ []byte) error {
			docIDs = append(docIDs, string(k))
			return nil
		})
		return docIDs
	}

	var docIDs []string
	_ = json.Unmarshal(legacyData, &docIDs)
	return docIDs
}

func removeStringFromJSONList(data []byte, value string) []string {
	var existing []string
	_ = json.Unmarshal(data, &existing)
	filtered := existing[:0]
	for _, item := range existing {
		if item != value {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

// SearchFTS exposes the search intersection logic for the HTTP API.
func (s *Store) SearchFTS(database, collection, query string) ([]string, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return nil, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, err
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, err
	}

	var results []string
	err = db.View(func(tx *bolt.Tx) error {
		results = searchFTS(tx, collection, query)
		return nil
	})
	return results, err
}

func deleteFTSForCollectionTx(tx *bolt.Tx, collection string) error {
	if configBucket := tx.Bucket(ftsConfigBucket); configBucket != nil {
		if err := configBucket.Delete([]byte(collection)); err != nil {
			return err
		}
	}

	prefix := []byte(collection + ":")
	for _, bucketName := range [][]byte{ftsIndexBucket, ftsReverseBucket} {
		b := tx.Bucket(bucketName)
		if b == nil {
			continue
		}
		c := b.Cursor()
		for k, _ := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, _ = c.Next() {
			key := append([]byte(nil), k...)
			if b.Bucket(key) != nil {
				if err := b.DeleteBucket(key); err != nil {
					return err
				}
			} else {
				if err := c.Delete(); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
