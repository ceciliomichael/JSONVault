package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jsonvault/internal/store"
)

func TestPresenceAPI(t *testing.T) {
	dbRoot := t.TempDir()
	db, err := store.New(dbRoot, 10, nil)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer db.Close()

	handler := NewUnauthenticatedHandler(db, Options{MaxBodyBytes: 1024 * 1024})
	server := httptest.NewServer(handler)
	defer server.Close()

	// 1. Initial presence should be 0
	resp, _ := http.Get(server.URL + "/api/v1/testdb/testcol/presence")
	var pres map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&pres)
	resp.Body.Close()

	if int(pres["count"].(float64)) != 0 {
		t.Errorf("expected 0 count, got %v", pres["count"])
	}

	// 2. Send heartbeat
	body := []byte(`{"client_id": "client_1", "metadata": {"name": "Alice"}}`)
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/testdb/testcol/heartbeat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp2, _ := http.DefaultClient.Do(req)
	if resp2.StatusCode != 200 {
		t.Errorf("expected 200 heartbeat, got %d", resp2.StatusCode)
	}
	resp2.Body.Close()

	// 3. Check presence
	resp3, _ := http.Get(server.URL + "/api/v1/testdb/testcol/presence")
	var pres3 map[string]interface{}
	json.NewDecoder(resp3.Body).Decode(&pres3)
	resp3.Body.Close()

	if int(pres3["count"].(float64)) != 1 {
		t.Fatalf("expected 1 count, got %v", pres3["count"])
	}
	clients := pres3["clients"].([]interface{})
	client0 := clients[0].(map[string]interface{})
	if client0["client_id"] != "client_1" {
		t.Errorf("expected client_id client_1, got %v", client0["client_id"])
	}
	state := pres3["state"].(map[string]interface{})
	metas := state["client_1"].([]interface{})
	if len(metas) != 1 {
		t.Fatalf("expected 1 presence state entry, got %d", len(metas))
	}

	// 4. Leave presence
	leaveBody := []byte(`{"client_id": "client_1"}`)
	req4, _ := http.NewRequest("DELETE", server.URL+"/api/v1/testdb/testcol/heartbeat", bytes.NewReader(leaveBody))
	req4.Header.Set("Content-Type", "application/json")
	resp4, _ := http.DefaultClient.Do(req4)
	if resp4.StatusCode != 200 {
		t.Errorf("expected 200 leave, got %d", resp4.StatusCode)
	}
	resp4.Body.Close()

	// 5. Check presence again
	resp5, _ := http.Get(server.URL + "/api/v1/testdb/testcol/presence")
	var pres5 map[string]interface{}
	json.NewDecoder(resp5.Body).Decode(&pres5)
	resp5.Body.Close()

	if int(pres5["count"].(float64)) != 0 {
		t.Errorf("expected 0 count after leave, got %v", pres5["count"])
	}
}
