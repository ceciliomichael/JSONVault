package store

import (
	"net/http"
	"testing"
)

func TestWebhookRejectsUnsafeLocalTargets(t *testing.T) {
	t.Setenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS", "")

	unsafeTargets := []string{
		"http://127.0.0.1:8080/hook",
		"http://localhost:8080/hook",
		"http://169.254.169.254/latest/meta-data",
	}
	for _, target := range unsafeTargets {
		if isSafeURL(target) {
			t.Fatalf("expected unsafe webhook target to be rejected: %s", target)
		}
		if client, ok := safeWebhookHTTPClient(target); ok || client != nil {
			t.Fatalf("expected no client for unsafe webhook target: %s", target)
		}
	}
}

func TestWebhookLocalOverrideIsExplicit(t *testing.T) {
	t.Setenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS", "true")

	if !isSafeURL("http://127.0.0.1:8080/hook") {
		t.Fatal("local webhook override should allow loopback URLs in tests")
	}
	client, ok := safeWebhookHTTPClient("http://127.0.0.1:8080/hook")
	if !ok || client == nil {
		t.Fatal("expected local override client")
	}
}

func TestWebhookRedirectsAreDisabled(t *testing.T) {
	err := noWebhookRedirects(&http.Request{}, []*http.Request{{}})
	if err == nil {
		t.Fatal("expected redirect error")
	}
}

func TestWebhookTargetLimiter(t *testing.T) {
	limiter := newWebhookTargetLimiter(1)
	release, ok := limiter.acquire("https://example.com/hook")
	if !ok {
		t.Fatal("first acquire should succeed")
	}
	if _, ok := limiter.acquire("https://example.com/other"); ok {
		t.Fatal("second acquire for same target should be limited")
	}
	release()
	if release, ok := limiter.acquire("https://example.com/other"); !ok {
		t.Fatal("acquire should succeed after release")
	} else {
		release()
	}
}

func TestGenerateWebhookSecretReturnsRandomHex(t *testing.T) {
	secret, err := GenerateWebhookSecret()
	if err != nil {
		t.Fatalf("GenerateWebhookSecret: %v", err)
	}
	if len(secret) != 64 {
		t.Fatalf("secret length = %d, want 64", len(secret))
	}
}

func TestSetWebhooksValidatesConfig(t *testing.T) {
	t.Setenv("JSONVAULT_ALLOW_LOCAL_WEBHOOKS", "")

	db, err := New(t.TempDir(), 8, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer db.Close()

	if _, err := db.CreateCollection("testdb", "users"); err != nil {
		t.Fatalf("CreateCollection: %v", err)
	}
	if _, err := db.SetWebhooks("testdb", "users", []WebhookConfig{{URL: "http://127.0.0.1:8080/hook", Events: []string{"insert"}}}); err == nil {
		t.Fatal("expected unsafe webhook config error")
	}
}
