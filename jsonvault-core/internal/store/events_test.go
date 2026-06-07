package store

import (
	"sync"
	"testing"
)

func TestPublishEventDisconnectsSlowSubscribers(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	sub := db.Subscribe("testdb", "events")
	for i := 0; i < cap(sub.Ch)+1; i++ {
		db.PublishEvent(Event{
			Action:     "insert",
			Database:   "testdb",
			Collection: "events",
			DocumentID: "doc",
		})
	}

	if count := db.GetSubscriberCount("testdb", "events"); count != 0 {
		t.Fatalf("subscriber count = %d, want 0", count)
	}

	for {
		select {
		case _, ok := <-sub.Ch:
			if !ok {
				return
			}
		default:
			t.Fatal("slow subscriber channel was not closed")
		}
	}
}

func TestPublishEventAssignsMonotonicSequences(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	sub := db.Subscribe("testdb", "events")
	defer db.Unsubscribe(sub)

	db.PublishEvent(Event{Action: "insert", Database: "testdb", Collection: "events", DocumentID: "a"})
	db.PublishEvent(Event{Action: "update", Database: "testdb", Collection: "events", DocumentID: "a"})

	first := <-sub.Ch
	second := <-sub.Ch
	if first.Sequence == 0 || second.Sequence != first.Sequence+1 {
		t.Fatalf("unexpected sequences: first=%d second=%d", first.Sequence, second.Sequence)
	}
}

func TestWebhookQueueIsBounded(t *testing.T) {
	s := &Store{
		webhookQueue: make(chan Event, 1),
		webhookStop:  make(chan struct{}),
	}

	s.enqueueWebhook(Event{Database: "testdb", Collection: "events", DocumentID: "a"})
	s.enqueueWebhook(Event{Database: "testdb", Collection: "events", DocumentID: "b"})

	if queued := len(s.webhookQueue); queued != 1 {
		t.Fatalf("queued events = %d, want bounded queue length 1", queued)
	}
}

func TestConcurrentWritesPublishIncreasingSequences(t *testing.T) {
	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	sub := db.Subscribe("testdb", "events")
	defer db.Unsubscribe(sub)

	const writes = 20
	var wg sync.WaitGroup
	errs := make(chan error, writes)
	for i := 0; i < writes; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := db.CreateDocument("testdb", "events", []byte(`{"n":1}`))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("CreateDocument: %v", err)
		}
	}

	var previous uint64
	for i := 0; i < writes; i++ {
		event := <-sub.Ch
		if event.Sequence <= previous {
			t.Fatalf("sequence %d after %d", event.Sequence, previous)
		}
		previous = event.Sequence
	}
}
