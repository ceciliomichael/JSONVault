package httpapi

import (
	"bufio"
	"encoding/json"
	"strings"
	"testing"

	"jsonvault/internal/store"
)

func readSSEEvent(t *testing.T, reader *bufio.Reader) store.Event {
	t.Helper()

	for {
		var data strings.Builder
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("failed to read from stream: %v", err)
		}

		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			t.Fatalf("expected SSE data format, got: %s", line)
		}
		data.WriteString(strings.TrimPrefix(line, "data: "))

		for {
			line, err = reader.ReadString('\n')
			if err != nil {
				t.Fatalf("failed to read from stream: %v", err)
			}
			line = strings.TrimSpace(line)
			if line == "" {
				break
			}
			if strings.HasPrefix(line, "data: ") {
				data.WriteString(strings.TrimPrefix(line, "data: "))
			}
		}

		var event store.Event
		if err := json.Unmarshal([]byte(data.String()), &event); err != nil {
			t.Fatalf("failed to parse event JSON: %v", err)
		}
		return event
	}
}
