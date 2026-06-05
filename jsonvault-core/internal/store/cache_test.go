package store

import (
	"fmt"
	"testing"
)

func TestLRUCacheCapacityLimit(t *testing.T) {
	// 256 total capacity -> 1 per shard
	cache := NewLRUCache(256)
	
	// Insert enough items to overflow the capacity of most shards
	for i := 0; i < 2000; i++ {
		key := fmt.Sprintf("k%d", i)
		cache.Set(key, []byte(`{"n":1}`))
	}

	// Because of hashing, some shards might get 0 items and others multiple,
	// but no shard should exceed its capacity of 1.
	// So total length should be <= 256.
	if cache.Len() > 256 {
		t.Fatalf("expected cache size to be <= 256 due to shard limits, got %d", cache.Len())
	}
}

func TestLRUCacheReturnsCopies(t *testing.T) {
	cache := NewLRUCache(256)
	cache.Set("doc", []byte(`{"safe":true}`))

	value, ok := cache.Get("doc")
	if !ok {
		t.Fatal("expected cache hit")
	}
	value[0] = '['

	value, ok = cache.Get("doc")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if string(value) != `{"safe":true}` {
		t.Fatalf("cache value was mutated through returned slice: %s", value)
	}
}
