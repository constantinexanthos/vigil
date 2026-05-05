// vigil-proxy is the agent-aware data plane for Vigil.
//
// v0.0.1: HTTP server that issues, fetches, and lists Ed25519-signed
// agent identities. In-memory store. The first useful primitive in
// the proxy stack.
//
// See docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/costaxanthos/vigil/proxy/internal/config"
	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("vigil-proxy: %v", err)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	iss, err := identity.NewIssuer()
	if err != nil {
		return err
	}
	store := identity.NewMemStore()
	idSvc := identity.NewService(iss, store)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		w.Write([]byte(`{"ok":true,"version":"v0.0.1"}`))
	})
	idSvc.Routes(mux)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           withLog(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("vigil-proxy v0.0.1 listening on %s (issuer pubkey %s)", cfg.Addr, iss.PublicKeyB64())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server error: %v", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

func withLog(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		h.ServeHTTP(ww, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, ww.status, time.Since(start))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
