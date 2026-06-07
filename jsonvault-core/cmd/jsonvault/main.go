package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"jsonvault/internal/auth"
	"jsonvault/internal/config"
	"jsonvault/internal/httpapi"
	"jsonvault/internal/store"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "restore" {
		if err := runRestore(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "restore:", err)
			os.Exit(1)
		}
		return
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("load config", "error", err)
		os.Exit(1)
	}

	db, err := store.NewWithOptions(cfg.DataDir, cfg.CacheEntries, cfg.EncryptionKey, store.Options{
		EncryptionRequired: cfg.EncryptionRequired,
		MaxDocumentBytes:   cfg.MaxDocumentBytes,
		MaxResponseBytes:   cfg.MaxResponseBytes,
		MaxQueryScanDocs:   cfg.MaxQueryScanDocs,
		MaxQueryScanBytes:  cfg.MaxQueryScanBytes,
		MaxQueryDuration:   cfg.MaxQueryDuration,
		BackupTempDir:      cfg.BackupTempDir,
		BackupConcurrency:  cfg.BackupConcurrency,
	})
	if err != nil {
		slog.Error("open store", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	authenticator, err := auth.NewWithRevocationFile(cfg.AdminKey, cfg.JWTSecret, filepath.Join(cfg.DataDir, "revoked-jwts.json"))
	if err != nil {
		slog.Error("load revoked jwt list", "error", err)
		os.Exit(1)
	}

	handler := httpapi.NewHandler(db, authenticator, httpapi.Options{
		MaxBodyBytes:   cfg.MaxBodyBytes,
		AdminRateLimit: cfg.AdminRateLimit,
	})

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
		MaxHeaderBytes:    cfg.MaxHeaderBytes,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go db.StartTTLWorker(ctx)
	if cfg.PprofAddr != "" {
		go func() {
			slog.Info("pprof diagnostics listening", "addr", cfg.PprofAddr)
			if err := http.ListenAndServe(cfg.PprofAddr, nil); err != nil && !errors.Is(err, http.ErrServerClosed) {
				slog.Error("serve pprof", "error", err)
			}
		}()
	}

	errCh := make(chan error, 1)
	go func() {
		banner := `
      _  _____  ____  _   ___      __         _ _   
     | |/ ____|/ __ \| \ | \ \    / /        | | |  
     | | (___ | |  | |  \| |\ \  / /_ _ _   _| | |_  
 _   | |\___ \| |  | | . ' | \ \/ / _' | | | | | __| 
| |__| |____) | |__| | |\  |  \  / (_| | |_| | | |_  
 \____/|_____/ \____/|_| \_|   \/ \__,_|\__,_|_|\__| 

  🚀 Server running on %s
  📁 Data directory: %s

`
		fmt.Printf(banner, cfg.Addr, cfg.DataDir)

		errCh <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("shutdown server", "error", err)
			os.Exit(1)
		}
		slog.Info("JSONVault shutdown gracefully")
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("serve", "error", err)
			os.Exit(1)
		}
	}
}
