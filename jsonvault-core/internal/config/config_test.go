package config

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

var configEnvNames = []string{
	"JSONVAULT_ENV_FILE",
	"JSONVAULT_API_KEY",
	"JSONVAULT_API_KEYS",
	"JSONVAULT_ADMIN_KEY",
	"JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE",
	"JSONVAULT_ADDR",
	"JSONVAULT_BASE_URL",
	"JSONVAULT_DATA_DIR",
	"JSONVAULT_ENCRYPTION_KEY",
	"JSONVAULT_ENCRYPTION_REQUIRED",
	"JSONVAULT_JWT_SECRET",
	"JSONVAULT_CACHE_ENTRIES",
	"JSONVAULT_MAX_BODY_BYTES",
	"JSONVAULT_READ_HEADER_TIMEOUT",
	"JSONVAULT_READ_TIMEOUT",
	"JSONVAULT_WRITE_TIMEOUT",
	"JSONVAULT_IDLE_TIMEOUT",
	"JSONVAULT_SHUTDOWN_TIMEOUT",
}

func TestLoadReadsDotEnvAndDefaults(t *testing.T) {
	clearConfigEnv(t)
	envPath := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(envPath, []byte("JSONVAULT_ADMIN_KEY=admin_secret\nJSONVAULT_JWT_SECRET=jwt_secret\nJSONVAULT_DATA_DIR=./db\nJSONVAULT_CACHE_ENTRIES=12\n"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	t.Setenv("JSONVAULT_ENV_FILE", envPath)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AdminKey != "admin_secret" {
		t.Errorf("expected adminKey admin_secret, got %v", cfg.AdminKey)
	}
	if string(cfg.JWTSecret) != "jwt_secret" {
		t.Errorf("expected jwtSecret jwt_secret, got %v", string(cfg.JWTSecret))
	}
	if cfg.DataDir != "./db" {
		t.Fatalf("DataDir = %q", cfg.DataDir)
	}
	if cfg.CacheEntries != 12 {
		t.Fatalf("CacheEntries = %d", cfg.CacheEntries)
	}
	if cfg.Addr != ":8080" {
		t.Fatalf("Addr = %q", cfg.Addr)
	}
}

func TestLoadRequiresAPIKey(t *testing.T) {
	clearConfigEnv(t)
	os.Unsetenv("JSONVAULT_ADMIN_KEY")
	_, err := Load()
	if !errors.Is(err, ErrMissingAdminKey) {
		t.Errorf("expected ErrMissingAdminKey, got %v", err)
	}
}

func TestLoadRejectsInvalidCacheEntries(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("JSONVAULT_ENV_FILE", filepath.Join(t.TempDir(), "missing.env"))
	t.Setenv("JSONVAULT_ADMIN_KEY", "admin_secret")
	t.Setenv("JSONVAULT_JWT_SECRET", "jwt_secret")
	t.Setenv("JSONVAULT_CACHE_ENTRIES", "0")

	_, err := Load()
	if err == nil {
		t.Fatal("expected invalid cache entry error")
	}
}

func TestLoadRejectsInvalidAdminRateLimit(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("JSONVAULT_ENV_FILE", filepath.Join(t.TempDir(), "missing.env"))
	t.Setenv("JSONVAULT_ADMIN_KEY", "admin_secret")
	t.Setenv("JSONVAULT_JWT_SECRET", "jwt_secret")
	t.Setenv("JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE", "0")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid admin rate limit error")
	}
}

func TestLoadRejectsEncryptionRequiredWithoutKey(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("JSONVAULT_ENV_FILE", filepath.Join(t.TempDir(), "missing.env"))
	t.Setenv("JSONVAULT_ADMIN_KEY", "admin_secret")
	t.Setenv("JSONVAULT_JWT_SECRET", "jwt_secret")
	t.Setenv("JSONVAULT_ENCRYPTION_REQUIRED", "true")

	if _, err := Load(); err == nil {
		t.Fatal("expected encryption required key error")
	}
}

func TestLoadAcceptsEncryptionRequiredWithValidKey(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("JSONVAULT_ENV_FILE", filepath.Join(t.TempDir(), "missing.env"))
	t.Setenv("JSONVAULT_ADMIN_KEY", "admin_secret")
	t.Setenv("JSONVAULT_JWT_SECRET", "jwt_secret")
	t.Setenv("JSONVAULT_ENCRYPTION_REQUIRED", "true")
	t.Setenv("JSONVAULT_ENCRYPTION_KEY", "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.EncryptionRequired {
		t.Fatal("EncryptionRequired = false, want true")
	}
	if len(cfg.EncryptionKey) != 32 {
		t.Fatalf("EncryptionKey length = %d, want 32", len(cfg.EncryptionKey))
	}
}

func TestLoadDotEnvDoesNotOverrideExistingEnvironment(t *testing.T) {
	clearConfigEnv(t)
	envPath := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(envPath, []byte("JSONVAULT_API_KEY=from-file\n"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	t.Setenv("JSONVAULT_API_KEY", "from-env")

	if err := LoadDotEnvFile(envPath); err != nil {
		t.Fatalf("LoadDotEnvFile: %v", err)
	}
	if got := os.Getenv("JSONVAULT_API_KEY"); got != "from-env" {
		t.Fatalf("JSONVAULT_API_KEY = %q", got)
	}
}

func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, name := range configEnvNames {
		name := name
		original, existed := os.LookupEnv(name)
		os.Unsetenv(name)
		t.Cleanup(func() {
			if existed {
				_ = os.Setenv(name, original)
				return
			}
			_ = os.Unsetenv(name)
		})
	}
}
