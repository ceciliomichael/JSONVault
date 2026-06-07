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

type ListResult struct {
	Documents []Document
	Total     int
	Stats     QueryStats
}

type QueryStats struct {
	ScannedDocuments int
	ScannedBytes     int64
	ReturnedBytes    int64
	IndexUsed        string
	SortMode         string
	FTSCandidates    int
}

func (s *Store) ListDocuments(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}, sortField string, searchQuery string) ([]Document, int, error) {
	result, err := s.ListDocumentsDetailed(ctx, database, collection, limit, offset, filter, sortField, searchQuery)
	if err != nil {
		return nil, 0, err
	}
	return result.Documents, result.Total, nil
}

func (s *Store) ListDocumentsDetailed(ctx context.Context, database, collection string, limit, offset int, filter map[string]interface{}, sortField string, searchQuery string) (ListResult, error) {
	ctx = contextOrBackground(ctx)
	if s.maxQueryDuration > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, s.maxQueryDuration)
		defer cancel()
	}
	if err := ctx.Err(); err != nil {
		return ListResult{}, err
	}
	if err := ValidateDatabaseName(database); err != nil {
		return ListResult{}, err
	}
	if err := ValidateCollectionName(collection); err != nil {
		return ListResult{}, err
	}
	for field := range filter {
		if err := ValidateFieldName(field); err != nil {
			return ListResult{}, err
		}
	}
	if sortField != "" {
		field := strings.TrimPrefix(sortField, "-")
		if err := ValidateFieldName(field); err != nil {
			return ListResult{}, err
		}
	}

	path := filepath.Join(s.root, database+".db")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ListResult{}, ErrNotFound
		}
		return ListResult{}, fmt.Errorf("inspect database: %w", err)
	}

	db, err := s.getDB(database)
	if err != nil {
		return ListResult{}, err
	}

	if limit <= 0 {
		limit = 100
	}

	documents := []Document{}
	var total int
	var matched int
	stats := QueryStats{SortMode: "none"}
	if sortField != "" {
		stats.SortMode = "in_memory"
	}
	budget := queryBudget{store: s, stats: &stats}

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
			stats.FTSCandidates = len(searchIDs)
			if err := budget.checkCandidates(len(searchIDs)); err != nil {
				return err
			}
		}

		var indexedField, indexedValue string
		if len(filter) > 0 && !useSearch {
			indexes := getIndexedFieldsTx(tx, collection)
			for _, idx := range indexes {
				if val, ok := filter[idx]; ok {
					indexedField = idx
					indexedValue = encodeIndexValue(val)
					stats.IndexUsed = idx
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
				if err := budget.scan(v); err != nil {
					return err
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
						if err := budget.returnDocument(k, plaintext); err != nil {
							return err
						}
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
								if err := budget.scan(v); err != nil {
									return err
								}
								plaintext, owned, err := decryptDocumentOwned(v, s.encryptionKey, s.encryptionRequired)
								if err != nil {
									return fmt.Errorf("corrupt document (decrypt): %w", err)
								}
								if err := budget.returnDocument(string(k), plaintext); err != nil {
									return err
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
							if err := budget.scan(v); err != nil {
								return err
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
									if err := budget.returnDocument(string(k), plaintext); err != nil {
										return err
									}
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

				if err := budget.scan(v); err != nil {
					return err
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
						if err := budget.returnDocument(string(k), plaintext); err != nil {
							return err
						}
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
			return ListResult{}, ErrNotFound
		}
		return ListResult{}, fmt.Errorf("list documents: %w", err)
	}

	// Apply sorting if requested
	if sortField != "" && len(documents) > 0 {
		documents = sortAndPageDocuments(documents, sortField, limit, offset)
	}

	if len(filter) > 0 {
		total = matched
	}

	return ListResult{Documents: documents, Total: total, Stats: stats}, nil
}

type queryBudget struct {
	store *Store
	stats *QueryStats
}

func (b *queryBudget) scan(data []byte) error {
	b.stats.ScannedDocuments++
	b.stats.ScannedBytes += int64(len(data))
	if b.store.maxQueryScanDocs > 0 && b.stats.ScannedDocuments > b.store.maxQueryScanDocs {
		return fmt.Errorf("%w: scanned documents exceeded %d", ErrQueryLimitExceeded, b.store.maxQueryScanDocs)
	}
	if b.store.maxQueryScanBytes > 0 && b.stats.ScannedBytes > b.store.maxQueryScanBytes {
		return fmt.Errorf("%w: scanned bytes exceeded %d", ErrQueryLimitExceeded, b.store.maxQueryScanBytes)
	}
	return nil
}

func (b *queryBudget) returnDocument(id string, data []byte) error {
	b.stats.ReturnedBytes += int64(len(id) + len(data) + 96)
	if b.store.maxResponseBytes > 0 && b.stats.ReturnedBytes > int64(b.store.maxResponseBytes) {
		return fmt.Errorf("%w: response bytes exceeded %d", ErrQueryLimitExceeded, b.store.maxResponseBytes)
	}
	return nil
}

func (b *queryBudget) checkCandidates(count int) error {
	if b.store.maxQueryScanDocs > 0 && count > b.store.maxQueryScanDocs {
		return fmt.Errorf("%w: fts candidates exceeded %d", ErrQueryLimitExceeded, b.store.maxQueryScanDocs)
	}
	return nil
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
