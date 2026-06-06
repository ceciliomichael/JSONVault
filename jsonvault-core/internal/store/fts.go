package store

import (
	"encoding/json"
	"fmt"
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

	db, err := s.getDB(database)
	if err != nil {
		return err
	}

	config := FTSConfig{Fields: fields}
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}

	return db.Update(func(tx *bolt.Tx) error {
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

		return b.Put([]byte(collection), data)
	})
}

// GetFTSConfig retrieves the FTS configuration for a collection.
func (s *Store) GetFTSConfig(tx *bolt.Tx, collection string) (*FTSConfig, error) {
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
	config, err := (*Store)(nil).GetFTSConfig(tx, collection) // We don't need the actual Store instance here since we pass tx
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

	// 2. Store forward mapping (token -> docIDs)
	for _, token := range tokens {
		tokenKey := []byte(fmt.Sprintf("%s:%s", collection, token))
		var docIDs []string
		
		existing := idxBucket.Get(tokenKey)
		if existing != nil {
			json.Unmarshal(existing, &docIDs)
		}

		// Ensure no duplicates
		found := false
		for _, id := range docIDs {
			if id == docID {
				found = true
				break
			}
		}
		if !found {
			docIDs = append(docIDs, docID)
			newData, _ := json.Marshal(docIDs)
			idxBucket.Put(tokenKey, newData)
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
		var docIDs []string
		
		existing := idxBucket.Get(tokenKey)
		if existing != nil {
			json.Unmarshal(existing, &docIDs)
			
			var newDocIDs []string
			for _, id := range docIDs {
				if id != docID {
					newDocIDs = append(newDocIDs, id)
				}
			}

			if len(newDocIDs) == 0 {
				idxBucket.Delete(tokenKey)
			} else {
				newData, _ := json.Marshal(newDocIDs)
				idxBucket.Put(tokenKey, newData)
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

	var resultIDs []string
	firstToken := true

	for _, token := range tokens {
		tokenKey := []byte(fmt.Sprintf("%s:%s", collection, token))
		data := idxBucket.Get(tokenKey)
		
		if data == nil {
			// If ANY token is missing, the intersection is empty!
			return []string{}
		}

		var docIDs []string
		json.Unmarshal(data, &docIDs)

		if firstToken {
			resultIDs = docIDs
			firstToken = false
		} else {
			// Intersect
			var intersection []string
			for _, rID := range resultIDs {
				for _, dID := range docIDs {
					if rID == dID {
						intersection = append(intersection, rID)
						break
					}
				}
			}
			resultIDs = intersection
			if len(resultIDs) == 0 {
				return []string{}
			}
		}
	}

	return resultIDs
}

// SearchFTS exposes the search intersection logic for the HTTP API.
func (s *Store) SearchFTS(database, collection, query string) ([]string, error) {
	if err := ValidateDatabaseName(database); err != nil {
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
