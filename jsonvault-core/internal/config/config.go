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

var ErrMissingAdminKey = errors.New("missing JSONVAULT_ADMIN_KEY")
var ErrMissingJWTSecret = errors.New("missing JSONVAULT_JWT_SECRET")

type Config struct {
	Addr               string
	DataDir            string
	Profile            string
	AdminKey           string
	JWTSecret          []byte
	CacheEntries       int
	MaxBodyBytes       int64
	MaxDocumentBytes   int
	MaxResponseBytes   int
	MaxQueryScanDocs   int
	MaxQueryScanBytes  int64
	MaxQueryDuration   time.Duration
	BackupTempDir      string
	BackupConcurrency  int
	MaxHeaderBytes     int
	PprofAddr          string
	AdminRateLimit     int
	ReadHeaderTimeout  time.Duration
	ReadTimeout        time.Duration
	WriteTimeout       time.Duration
	IdleTimeout        time.Duration
	ShutdownTimeout    time.Duration
	EncryptionKey      []byte
	EncryptionRequired bool
}

func Load() (Config, error) {
	envFile := strings.TrimSpace(os.Getenv("JSONVAULT_ENV_FILE"))
	if envFile == "" {
		envFile = ".env"
	}
	if err := LoadDotEnvFile(envFile); err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, err
	}

	profile := strings.ToLower(envString("JSONVAULT_PROFILE", "default"))
	defaults, err := defaultsForProfile(profile)
	if err != nil {
		return Config{}, err
	}

	adminKey := envString("JSONVAULT_ADMIN_KEY", "")
	if adminKey == "" {
		return Config{}, ErrMissingAdminKey
	}

	jwtSecretStr := envString("JSONVAULT_JWT_SECRET", "")
	if jwtSecretStr == "" {
		return Config{}, ErrMissingJWTSecret
	}
	jwtSecret := []byte(jwtSecretStr)

	cacheEntries, err := envInt("JSONVAULT_CACHE_ENTRIES", defaults.cacheEntries)
	if err != nil {
		return Config{}, err
	}
	if cacheEntries < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_CACHE_ENTRIES must be greater than zero")
	}

	maxBodyBytes, err := envInt64("JSONVAULT_MAX_BODY_BYTES", defaults.maxBodyBytes)
	if err != nil {
		return Config{}, err
	}
	if maxBodyBytes < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_BODY_BYTES must be greater than zero")
	}
	maxDocumentBytes, err := envInt("JSONVAULT_MAX_DOCUMENT_BYTES", int(maxBodyBytes))
	if err != nil {
		return Config{}, err
	}
	if maxDocumentBytes < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_DOCUMENT_BYTES must be greater than zero")
	}
	maxResponseBytes, err := envInt("JSONVAULT_MAX_RESPONSE_BYTES", defaults.maxResponseBytes)
	if err != nil {
		return Config{}, err
	}
	if maxResponseBytes < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_RESPONSE_BYTES must be greater than zero")
	}
	maxQueryScanDocs, err := envInt("JSONVAULT_MAX_QUERY_SCAN_DOCS", defaults.maxQueryScanDocs)
	if err != nil {
		return Config{}, err
	}
	if maxQueryScanDocs < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_QUERY_SCAN_DOCS must be greater than zero")
	}
	maxQueryScanBytes, err := envInt64("JSONVAULT_MAX_QUERY_SCAN_BYTES", defaults.maxQueryScanBytes)
	if err != nil {
		return Config{}, err
	}
	if maxQueryScanBytes < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_QUERY_SCAN_BYTES must be greater than zero")
	}
	maxQueryDuration, err := envDuration("JSONVAULT_MAX_QUERY_DURATION", defaults.maxQueryDuration)
	if err != nil {
		return Config{}, err
	}
	backupTempDir := envString("JSONVAULT_BACKUP_TEMP_DIR", "")
	backupConcurrency, err := envInt("JSONVAULT_BACKUP_CONCURRENCY", defaults.backupConcurrency)
	if err != nil {
		return Config{}, err
	}
	if backupConcurrency < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_BACKUP_CONCURRENCY must be greater than zero")
	}
	maxHeaderBytes, err := envInt("JSONVAULT_MAX_HEADER_BYTES", defaults.maxHeaderBytes)
	if err != nil {
		return Config{}, err
	}
	if maxHeaderBytes < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_MAX_HEADER_BYTES must be greater than zero")
	}
	adminRateLimit, err := envInt("JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE", 120)
	if err != nil {
		return Config{}, err
	}
	if adminRateLimit < 1 {
		return Config{}, fmt.Errorf("JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE must be greater than zero")
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
	encryptionRequired, err := envBool("JSONVAULT_ENCRYPTION_REQUIRED", false)
	if err != nil {
		return Config{}, err
	}
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
	if encryptionRequired && len(encryptionKey) != 32 {
		return Config{}, fmt.Errorf("JSONVAULT_ENCRYPTION_REQUIRED is true but JSONVAULT_ENCRYPTION_KEY is not configured")
	}

	return Config{
		Addr:               envString("JSONVAULT_ADDR", ":8080"),
		DataDir:            envString("JSONVAULT_DATA_DIR", "./data"),
		Profile:            profile,
		AdminKey:           adminKey,
		JWTSecret:          jwtSecret,
		CacheEntries:       cacheEntries,
		MaxBodyBytes:       maxBodyBytes,
		MaxDocumentBytes:   maxDocumentBytes,
		MaxResponseBytes:   maxResponseBytes,
		MaxQueryScanDocs:   maxQueryScanDocs,
		MaxQueryScanBytes:  maxQueryScanBytes,
		MaxQueryDuration:   maxQueryDuration,
		BackupTempDir:      backupTempDir,
		BackupConcurrency:  backupConcurrency,
		MaxHeaderBytes:     maxHeaderBytes,
		PprofAddr:          envString("JSONVAULT_PPROF_ADDR", ""),
		AdminRateLimit:     adminRateLimit,
		ReadHeaderTimeout:  readHeaderTimeout,
		ReadTimeout:        readTimeout,
		WriteTimeout:       writeTimeout,
		IdleTimeout:        idleTimeout,
		ShutdownTimeout:    shutdownTimeout,
		EncryptionKey:      encryptionKey,
		EncryptionRequired: encryptionRequired,
	}, nil
}

type profileDefaults struct {
	cacheEntries      int
	maxBodyBytes      int64
	maxResponseBytes  int
	maxQueryScanDocs  int
	maxQueryScanBytes int64
	maxQueryDuration  time.Duration
	backupConcurrency int
	maxHeaderBytes    int
}

func defaultsForProfile(profile string) (profileDefaults, error) {
	switch profile {
	case "", "default":
		return profileDefaults{
			cacheEntries:      10,
			maxBodyBytes:      10 * 1024 * 1024,
			maxResponseBytes:  32 * 1024 * 1024,
			maxQueryScanDocs:  50000,
			maxQueryScanBytes: 128 * 1024 * 1024,
			maxQueryDuration:  15 * time.Second,
			backupConcurrency: 1,
			maxHeaderBytes:    1 * 1024 * 1024,
		}, nil
	case "tiny":
		return profileDefaults{
			cacheEntries:      8,
			maxBodyBytes:      1 * 1024 * 1024,
			maxResponseBytes:  8 * 1024 * 1024,
			maxQueryScanDocs:  5000,
			maxQueryScanBytes: 16 * 1024 * 1024,
			maxQueryDuration:  5 * time.Second,
			backupConcurrency: 1,
			maxHeaderBytes:    256 * 1024,
		}, nil
	case "large":
		return profileDefaults{
			cacheEntries:      128,
			maxBodyBytes:      50 * 1024 * 1024,
			maxResponseBytes:  128 * 1024 * 1024,
			maxQueryScanDocs:  500000,
			maxQueryScanBytes: 1 * 1024 * 1024 * 1024,
			maxQueryDuration:  60 * time.Second,
			backupConcurrency: 2,
			maxHeaderBytes:    2 * 1024 * 1024,
		}, nil
	default:
		return profileDefaults{}, fmt.Errorf("JSONVAULT_PROFILE must be one of: tiny, default, large")
	}
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

func envBool(name string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", name, err)
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
