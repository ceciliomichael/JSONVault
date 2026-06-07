package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"

	"sort"
	"strings"

	stdjson "encoding/json"
	"github.com/bytedance/sonic"
	bolt "go.etcd.io/bbolt"
)

func (s *Store) ListDocuments(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}, sortField string, searchQuery string) ([]Document, int, error) {
	ctx = contextOrBackground(ctx)
	if err := ctx.Err(); err != nil {
		return nil, 0, err
	}
	if err := ValidateDatabaseName(database); err != nil {
		return nil, 0, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return nil, 0, err
	}
	for field := range filter {
		if err := ValidateFieldName(field); err != nil {
			return nil, 0, err
		}
	}
	if sortField != "" {
		field := strings.TrimPrefix(sortField, "-")
		if err := ValidateFieldName(field); err != nil {
			return nil, 0, err
		}
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, ErrNotFound
		}
		return nil, 0, fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return nil, 0, err
	}

	if limit <= 0 {
		limit = 100
	}

	documents := []Document{}
	var total int
	var matched int

	err = db.View(func(tx *bolt.Tx) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}

		total = getCollectionCountTx(tx, collection, b)

		var searchIDs []string
		useSearch := false
		if searchQuery != "" {
			useSearch = true
			searchIDs = searchFTS(tx, collection, searchQuery)
		}

		var indexedField, indexedValue string
		if len(filter) > 0 && !useSearch {
			indexes := getIndexedFieldsTx(tx, collection)
			for _, idx := range indexes {
				if val, ok := filter[idx]; ok {
					indexedField = idx
					indexedValue = encodeIndexValue(val)
					break
				}
			}
		}

		if useSearch {
			// Super fast path: Full-Text Search intersection
			matched = len(searchIDs) // Approximation before filters
			var seen int
			for _, k := range searchIDs {
				if err := ctx.Err(); err != nil {
					return err
				}
				v := b.Get([]byte(k))
				if v == nil {
					continue
				}
				plaintext, owned, err := decryptDocumentOwned(v, s.encryptionKey, s.encryptionRequired)
				if err != nil {
					return fmt.Errorf("corrupt document (decrypt): %w", err)
				}

				matches := true
				if len(filter) > 0 {
					var parsed map[string]interface{}
					if err := sonic.Unmarshal(plaintext, &parsed); err == nil {
						for fk, fv := range filter {
							val, exists := parsed[fk]
							if !exists || encodeIndexValue(val) != encodeIndexValue(fv) {
								matches = false
								break
							}
						}
					} else {
						matches = false
					}
				}

				if matches {
					if sortField != "" || (seen >= offset && len(documents) < limit) {
						documents = append(documents, Document{
							ID:       k,
							Document: stdjson.RawMessage(stableDocumentBytes(plaintext, owned)),
							ETag:     computeETag(plaintext),
						})
					}
					seen++
				}
			}
			matched = seen
		} else if indexedField != "" {
			// Fast path: use secondary index
			idxBucketName := getIndexBucketName(collection, indexedField)
			idxBucket := tx.Bucket(idxBucketName)
			if idxBucket != nil {
				valBucket := idxBucket.Bucket([]byte(indexedValue))
				if valBucket != nil {
					c := valBucket.Cursor()

					if len(filter) == 1 {
						// Single filter exact match: all items in this bucket match.
						matched = valBucket.Stats().KeyN
						var seen int
						for k, _ := c.First(); k != nil; k, _ = c.Next() {
							if err := ctx.Err(); err != nil {
								return err
							}
							if sortField == "" && len(documents) >= limit {
								break
							}
							if sortField != "" || seen >= offset {
								v := b.Get(k)
								if v == nil {
									continue
								}
								plaintext, owned, err := decryptDocumentOwned(v, s.encryptionKey, s.encryptionRequired)
								if err != nil {
									return fmt.Errorf("corrupt document (decrypt): %w", err)
								}
								documents = append(documents, Document{
									ID:       string(k),
									Document: stdjson.RawMessage(stableDocumentBytes(plaintext, owned)),
									ETag:     computeETag(plaintext),
								})
							}
							seen++
						}
					} else {
						// Multi-filter: need to decrypt and evaluate remaining filters
						for k, _ := c.First(); k != nil; k, _ = c.Next() {
							if err := ctx.Err(); err != nil {
								return err
							}
							v := b.Get(k)
							if v == nil {
								continue
							}
							plaintext, owned, err := decryptDocumentOwned(v, s.encryptionKey, s.encryptionRequired)
							if err != nil {
								return fmt.Errorf("corrupt document (decrypt): %w", err)
							}

							matches := true
							var parsed map[string]interface{}
							if err := sonic.Unmarshal(plaintext, &parsed); err == nil {
								for fk, fv := range filter {
									if fk == indexedField {
										continue
									}
									val, exists := parsed[fk]
									if !exists || encodeIndexValue(val) != encodeIndexValue(fv) {
										matches = false
										break
									}
								}
							} else {
								matches = false
							}

							if matches {
								if sortField != "" || (matched >= offset && len(documents) < limit) {
									documents = append(documents, Document{
										ID:       string(k),
										Document: stdjson.RawMessage(stableDocumentBytes(plaintext, owned)),
										ETag:     computeETag(plaintext),
									})
								}
								matched++
							}
						}
					}
				}
			}
		} else {
			// Slow path: full collection scan
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				if err := ctx.Err(); err != nil {
					return err
				}
				if len(documents) >= limit && sortField == "" {
					if len(filter) == 0 {
						break
					}
				}

				plaintext, owned, err := decryptDocumentOwned(v, s.encryptionKey, s.encryptionRequired)
				if err != nil {
					return fmt.Errorf("corrupt document (decrypt): %w", err)
				}

				matches := true
				if len(filter) > 0 {
					var parsed map[string]interface{}
					if err := sonic.Unmarshal(plaintext, &parsed); err == nil {
						for fk, fv := range filter {
							val, exists := parsed[fk]
							if !exists || encodeIndexValue(val) != encodeIndexValue(fv) {
								matches = false
								break
							}
						}
					} else {
						matches = false
					}
				}

				if matches {
					if sortField != "" || (matched >= offset && len(documents) < limit) {
						documents = append(documents, Document{
							ID:       string(k),
							Document: stdjson.RawMessage(stableDocumentBytes(plaintext, owned)),
							ETag:     computeETag(plaintext),
						})
					}
					matched++
				}
			}
		}
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, 0, ErrNotFound
		}
		return nil, 0, fmt.Errorf("list documents: %w", err)
	}

	// Apply sorting if requested
	if sortField != "" && len(documents) > 0 {
		documents = sortAndPageDocuments(documents, sortField, limit, offset)
	}

	if len(filter) > 0 {
		total = matched
	}

	return documents, total, nil
}

type sortableValue struct {
	kind    int
	number  float64
	boolean bool
	text    string
}

const (
	sortKindBool = iota
	sortKindNumber
	sortKindString
	sortKindOther
	sortKindMissing
)

func sortAndPageDocuments(documents []Document, sortField string, limit, offset int) []Document {
	desc := false
	if strings.HasPrefix(sortField, "-") {
		desc = true
		sortField = sortField[1:]
	}

	type sortableDocument struct {
		document Document
		value    sortableValue
	}

	sortable := make([]sortableDocument, 0, len(documents))
	for _, document := range documents {
		var parsed map[string]interface{}
		value := sortableValue{kind: sortKindMissing}
		if err := sonic.Unmarshal(document.Document, &parsed); err == nil {
			if raw, ok := parsed[sortField]; ok {
				value = normalizeSortValue(raw)
			}
		}
		sortable = append(sortable, sortableDocument{document: document, value: value})
	}

	sort.SliceStable(sortable, func(i, j int) bool {
		cmp := compareSortValues(sortable[i].value, sortable[j].value)
		if cmp == 0 {
			return sortable[i].document.ID < sortable[j].document.ID
		}
		if sortable[i].value.kind == sortKindMissing || sortable[j].value.kind == sortKindMissing {
			return cmp < 0
		}
		if desc {
			return cmp > 0
		}
		return cmp < 0
	})

	start := offset
	if start > len(sortable) {
		start = len(sortable)
	}
	end := start + limit
	if end > len(sortable) {
		end = len(sortable)
	}

	paged := make([]Document, 0, end-start)
	for _, item := range sortable[start:end] {
		paged = append(paged, item.document)
	}
	return paged
}

func normalizeSortValue(value interface{}) sortableValue {
	switch v := value.(type) {
	case bool:
		return sortableValue{kind: sortKindBool, boolean: v}
	case float64:
		if math.IsNaN(v) {
			return sortableValue{kind: sortKindMissing}
		}
		return sortableValue{kind: sortKindNumber, number: v}
	case string:
		return sortableValue{kind: sortKindString, text: v}
	case nil:
		return sortableValue{kind: sortKindMissing}
	default:
		return sortableValue{kind: sortKindOther, text: fmt.Sprintf("%v", v)}
	}
}

func compareSortValues(a, b sortableValue) int {
	if a.kind == sortKindMissing && b.kind == sortKindMissing {
		return 0
	}
	if a.kind == sortKindMissing {
		return 1
	}
	if b.kind == sortKindMissing {
		return -1
	}
	if a.kind != b.kind {
		if a.kind < b.kind {
			return -1
		}
		return 1
	}

	switch a.kind {
	case sortKindBool:
		if a.boolean == b.boolean {
			return 0
		}
		if !a.boolean {
			return -1
		}
		return 1
	case sortKindNumber:
		if a.number < b.number {
			return -1
		}
		if a.number > b.number {
			return 1
		}
		return 0
	default:
		if a.text < b.text {
			return -1
		}
		if a.text > b.text {
			return 1
		}
		return 0
	}
}

func (s *Store) GetDocument(database, collection, id string) (Document, error) {
	if err := ValidateDatabaseName(database); err != nil {
		return Document{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return Document{}, err
	}
	if err := ValidateDocumentID(id); err != nil {
		return Document{}, err
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return Document{}, err
	}

	var doc Document
	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(collection))
		if b == nil {
			return ErrNotFound
		}

		data := b.Get([]byte(id))
		if data == nil {
			return ErrNotFound
		}

		plaintext, owned, err := decryptDocumentOwned(data, s.encryptionKey, s.encryptionRequired)
		if err != nil {
			return fmt.Errorf("corrupt document (decrypt): %w", err)
		}

		docData := stableDocumentBytes(plaintext, owned)

		doc = Document{
			ID:       id,
			Document: docData,
			ETag:     computeETag(docData),
		}
		return nil
	})

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Document{}, ErrNotFound
		}
		return Document{}, fmt.Errorf("get document: %w", err)
	}

	return doc, nil
}
