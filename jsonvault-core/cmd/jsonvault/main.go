package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"jsonvault/internal/auth"
	"jsonvault/internal/config"
	"jsonvault/internal/httpapi"
	"jsonvault/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("load config", "error", err)
		os.Exit(1)
	}

	db, err := store.New(cfg.DataDir, cfg.CacheEntries, cfg.EncryptionKey)
	if err != nil {
		slog.Error("open store", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	authenticator, err := auth.New(cfg.APIKeys)
	if err != nil {
		slog.Error("configure auth", "error", err)
		os.Exit(1)
	}

	handler := httpapi.NewHandler(db, authenticator, httpapi.Options{
		MaxBodyBytes: cfg.MaxBodyBytes,
	})

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		slog.Info("JSONVault starting", "addr", cfg.Addr, "dataDir", cfg.DataDir, "baseURL", cfg.BaseURL)
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
