package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"

	"jsonvault/internal/auth"
	"jsonvault/internal/config"
	"jsonvault/internal/httpapi"
	"jsonvault/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := store.New(cfg.DataDir, cfg.CacheEntries)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}

	authenticator, err := auth.New(cfg.APIKeys)
	if err != nil {
		log.Fatalf("configure auth: %v", err)
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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		log.Printf("JSONVault listening on %s (data=%s, base_url=%s)", cfg.Addr, cfg.DataDir, cfg.BaseURL)
		errCh <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("shutdown server: %v", err)
		}
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("serve: %v", err)
		}
	}
}
