package auth

import "testing"

func TestAuthenticatorRequiresBearerToken(t *testing.T) {
	authenticator, err := New([]string{"secret"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	tests := map[string]bool{
		"Bearer secret":      true,
		"bearer secret":      true,
		"Bearer wrong":       false,
		"Basic secret":       false,
		"":                   false,
		"Bearer":             false,
		"Bearer    secret":   true,
		"Bearer secret more": false,
	}

	for header, want := range tests {
		if got, _ := authenticator.Authenticate(header); got != want {
			t.Fatalf("Authenticate(%q) = %v, want %v", header, got, want)
		}
	}
}
