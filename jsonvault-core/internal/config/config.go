package config

import (
	"bufio"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

var ErrMissingAPIKey = errors.New("missing JSONVAULT_API_KEY or JSONVAULT_API_KEYS")

type Config struct {
	Addr              string
	BaseURL           string
	DataDir           string
	APIKeys           []string
	CacheEntries      int
	MaxBodyBytes      int64
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownTimeout   time.Duration
	EncryptionKey     []byte
}

func Load() (Config, error) {
	envFile := strings.TrimSpace(os.Getenv("JSONVAULT_ENV_FILE"))
	if envFile == "" {
		envFile = ".env"
	}
	if err := LoadDotEnvFile(envFile); err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, err
	}

	keys := apiKeysFromEnv()
	if len(keys) == 0 {
		return Config{}, ErrMissingAPIKey
	}

	cacheEntries, err := envInt("JSONVAULT_CACHE_ENTRIES", 1024)
	if err != nil {
		return Config{}, err
	}
	if cacheEntries < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_CACHE_ENTRIES must be greater than zero")
	}

	maxBodyBytes, err := envInt64("JSONVAULT_MAX_BODY_BYTES", 10*1024*1024)
	if err != nil {
		return Config{}, err
	}
	if maxBodyBytes < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_BODY_BYTES must be greater than zero")
	}

	readHeaderTimeout, err := envDuration("JSONVAULT_READ_HEADER_TIMEOUT", 5*time.Second)
	if err != nil {
		return Config{}, err
	}
	readTimeout, err := envDuration("JSONVAULT_READ_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}
	writeTimeout, err := envDuration("JSONVAULT_WRITE_TIMEOUT", 30*time.Second)
	if err != nil {
		return Config{}, err
	}
	idleTimeout, err := envDuration("JSONVAULT_IDLE_TIMEOUT", 60*time.Second)
	if err != nil {
		return Config{}, err
	}
	shutdownTimeout, err := envDuration("JSONVAULT_SHUTDOWN_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}

	encryptionKeyStr := envString("JSONVAULT_ENCRYPTION_KEY", "")
	var encryptionKey []byte
	if encryptionKeyStr != "" {
		if len(encryptionKeyStr) != 64 {
			return Config{}, fmt.Errorf("JSONVAULT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)")
		}
		var err error
		encryptionKey, err = hex.DecodeString(encryptionKeyStr)
		if err != nil {
			return Config{}, fmt.Errorf("JSONVAULT_ENCRYPTION_KEY must be a valid hex string: %w", err)
		}
	}

	return Config{
		Addr:              envString("JSONVAULT_ADDR", ":8080"),
		BaseURL:           envString("JSONVAULT_BASE_URL", "http://localhost:8080"),
		DataDir:           envString("JSONVAULT_DATA_DIR", "./data"),
		APIKeys:           keys,
		CacheEntries:      cacheEntries,
		MaxBodyBytes:      maxBodyBytes,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		ShutdownTimeout:   shutdownTimeout,
		EncryptionKey:     encryptionKey,
	}, nil
}

func LoadDotEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		key, value, ok, err := parseEnvLine(scanner.Text())
		if err != nil {
			return fmt.Errorf("%s:%d: %w", path, lineNo, err)
		}
		if !ok {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("%s:%d: set env: %w", path, lineNo, err)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("%s: read env file: %w", path, err)
	}
	return nil
}

func parseEnvLine(line string) (string, string, bool, error) {
	line = strings.TrimSpace(strings.TrimPrefix(line, "\ufeff"))
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", false, nil
	}
	line = strings.TrimSpace(strings.TrimPrefix(line, "export "))

	key, value, ok := strings.Cut(line, "=")
	if !ok {
		return "", "", false, fmt.Errorf("expected KEY=VALUE")
	}
	key = strings.TrimSpace(key)
	value = strings.TrimSpace(value)
	if key == "" {
		return "", "", false, fmt.Errorf("empty key")
	}
	for _, r := range key {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return "", "", false, fmt.Errorf("invalid key %q", key)
	}

	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
			unquoted, err := strconv.Unquote(value)
			if err != nil && value[0] == '\'' {
				unquoted = strings.TrimSuffix(strings.TrimPrefix(value, "'"), "'")
				err = nil
			}
			if err != nil {
				return "", "", false, fmt.Errorf("invalid quoted value for %s: %w", key, err)
			}
			value = unquoted
		}
	}

	return key, value, true, nil
}

func apiKeysFromEnv() []string {
	seen := make(map[string]struct{})
	var keys []string
	add := func(value string) {
		for _, key := range strings.Split(value, ",") {
			key = strings.TrimSpace(key)
			if key == "" {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}
	add(os.Getenv("JSONVAULT_API_KEY"))
	add(os.Getenv("JSONVAULT_API_KEYS"))
	return keys
}

func envString(name, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", name, err)
	}
	return parsed, nil
}

func envInt64(name string, fallback int64) (int64, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", name, err)
	}
	return parsed, nil
}

func envDuration(name string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a duration: %w", name, err)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", name)
	}
	return parsed, nil
}
