package store

import (
	"bytes"
	"container/list"
	"hash/fnv"
	"strings"
	"sync"
)

const numShards = 256

type LRUCache struct {
	shards [numShards]*lruShard
}

type lruShard struct {
	mu       sync.Mutex
	capacity int
	items    map[string]*list.Element
	order    *list.List
}

type cacheEntry struct {
	key   string
	value []byte
}

func NewLRUCache(capacity int) *LRUCache {
	if capacity < 1 {
		capacity = 1
	}
	shardCapacity := capacity / numShards
	if shardCapacity < 1 {
		shardCapacity = 1
	}

	c := &LRUCache{}
	for i := 0; i < numShards; i++ {
		c.shards[i] = &lruShard{
			capacity: shardCapacity,
			items:    make(map[string]*list.Element),
			order:    list.New(),
		}
	}
	return c
}

func (c *LRUCache) getShard(key string) *lruShard {
	h := fnv.New32a()
	h.Write([]byte(key))
	return c.shards[h.Sum32()%numShards]
}

func (c *LRUCache) Get(key string) ([]byte, bool) {
	shard := c.getShard(key)
	shard.mu.Lock()
	defer shard.mu.Unlock()

	element, ok := shard.items[key]
	if !ok {
		return nil, false
	}
	shard.order.MoveToFront(element)
	entry := element.Value.(cacheEntry)
	return bytes.Clone(entry.value), true
}

func (c *LRUCache) Set(key string, value []byte) {
	shard := c.getShard(key)
	shard.mu.Lock()
	defer shard.mu.Unlock()

	if element, ok := shard.items[key]; ok {
		element.Value = cacheEntry{key: key, value: bytes.Clone(value)}
		shard.order.MoveToFront(element)
		return
	}

	element := shard.order.PushFront(cacheEntry{key: key, value: bytes.Clone(value)})
	shard.items[key] = element
	for len(shard.items) > shard.capacity {
		shard.removeOldest()
	}
}

func (c *LRUCache) Delete(key string) {
	shard := c.getShard(key)
	shard.mu.Lock()
	defer shard.mu.Unlock()

	if element, ok := shard.items[key]; ok {
		shard.removeElement(element)
	}
}

func (c *LRUCache) DeletePrefix(prefix string) {
	for i := 0; i < numShards; i++ {
		shard := c.shards[i]
		shard.mu.Lock()
		for key, element := range shard.items {
			if strings.HasPrefix(key, prefix) {
				shard.removeElement(element)
			}
		}
		shard.mu.Unlock()
	}
}

func (c *LRUCache) Len() int {
	total := 0
	for i := 0; i < numShards; i++ {
		shard := c.shards[i]
		shard.mu.Lock()
		total += len(shard.items)
		shard.mu.Unlock()
	}
	return total
}

func (s *lruShard) removeOldest() {
	oldest := s.order.Back()
	if oldest != nil {
		s.removeElement(oldest)
	}
}

func (s *lruShard) removeElement(element *list.Element) {
	s.order.Remove(element)
	entry := element.Value.(cacheEntry)
	delete(s.items, entry.key)
}
