// vigil-proxy is the agent-aware data plane for Vigil.
//
// v0.1.0b: single-goroutine pgproto3 message pump on the Postgres path.
// Every parsed frame is signed and written to the audit table in
// proxy.db; identity attachment happens via application_name=vigil:<token>
// at startup. The HTTP identity issuer from v0.0.2 still runs
// unconditionally; the Postgres proxy starts when --postgres-listen and
// --postgres-upstream are set (and --postgres-disabled is not).
//
// See docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md and
// docs/superpowers/specs/2026-05-07-three-agent-push-design.md.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/costaxanthos/vigil/proxy/internal/audit"
	"github.com/costaxanthos/vigil/proxy/internal/coalesce"
	"github.com/costaxanthos/vigil/proxy/internal/config"
	"github.com/costaxanthos/vigil/proxy/internal/identity"
	"github.com/costaxanthos/vigil/proxy/internal/mcpserver"
	"github.com/costaxanthos/vigil/proxy/internal/pgproxy"
	"github.com/costaxanthos/vigil/proxy/internal/ratelimit"
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

	// Make sure the parent directory exists for both default paths
	// (~/.vigil/). If the operator pointed --db / --key elsewhere, that
	// directory must already exist — LoadOrCreateIssuer + OpenSQLiteStore
	// both fail loud rather than silently creating arbitrary paths.
	if err := ensureParentDir(cfg.KeyPath); err != nil {
		return err
	}
	if err := ensureParentDir(cfg.DBPath); err != nil {
		return err
	}

	iss, err := identity.LoadOrCreateIssuer(cfg.KeyPath)
	if err != nil {
		return err
	}

	// MCP stdio mode short-circuits the rest of run(): the MCP host owns
	// the process lifecycle, stdout is reserved for JSON-RPC frames, and
	// the HTTP/Postgres listeners stay off. Anything on stdout other than
	// a Content-Length-framed message would corrupt the wire format.
	if cfg.MCPStdio {
		return runMCPStdio(cfg, iss)
	}
	store, err := identity.OpenSQLiteStore(cfg.DBPath)
	if err != nil {
		return err
	}
	defer store.Close()

	idSvc := identity.NewService(iss, store)

	mux := http.NewServeMux()
	healthzBody := []byte(fmt.Sprintf(`{"ok":true,"version":%q}`, config.Version))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		w.Write(healthzBody)
	})
	idSvc.Routes(mux)

	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           withLog(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Compose startup log line so HTTP and Postgres lines stay together.
	if cfg.PostgresProxyEnabled() {
		log.Printf(
			"vigil-proxy %s — http=%s postgres=%s → upstream=%s (db=%s key=%s pubkey=%s)",
			config.Version, cfg.Addr, cfg.PostgresListen, cfg.PostgresUpstream,
			cfg.DBPath, cfg.KeyPath, iss.PublicKeyB64(),
		)
	} else {
		log.Printf(
			"vigil-proxy %s — http=%s postgres=disabled (db=%s key=%s pubkey=%s)",
			config.Version, cfg.Addr, cfg.DBPath, cfg.KeyPath, iss.PublicKeyB64(),
		)
	}

	// Track both servers so SIGTERM drains both before we exit.
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("http server error: %v", err)
			stop()
		}
	}()

	// Wire the audit writer for the Postgres proxy. We open it on the
	// same SQLite file as the identity store so a single ~/.vigil/proxy.db
	// is the only persistent state file the operator backs up. We use
	// audit.Open (which manages its own *sql.DB handle) rather than
	// FromDB on the identity store's handle, because modernc.org/sqlite
	// is goroutine-safe via *sql.DB and the audit writer wants its own
	// connection-pool sizing independent of identity reads.
	var auditWriter *audit.DBWriter
	if cfg.PostgresProxyEnabled() {
		auditWriter, err = audit.Open(cfg.DBPath, iss)
		if err != nil {
			return fmt.Errorf("init audit writer: %w", err)
		}
		defer auditWriter.Close()
	}

	// Instantiate the fan-out coalescing cache unconditionally — its
	// existence is cheap. Wired into pgproxy.Server below; the relay
	// loop calls Lookup/Store on read-only frames outside transactions.
	coalesceCache := coalesce.New(coalesce.Options{TTL: cfg.CoalesceTTL})

	if cfg.PostgresProxyEnabled() {
		// Rate limiter: built-in defaults unless --ratelimit-config
		// points at a YAML file. Bad YAML is fatal — we exit non-
		// zero rather than silently fall back to defaults, which
		// would hide a misconfigured production deploy.
		rlCfg := ratelimit.DefaultConfig()
		if cfg.RateLimitConfigPath != "" {
			rlCfg, err = ratelimit.LoadConfig(cfg.RateLimitConfigPath)
			if err != nil {
				log.Fatalf("vigil-proxy: load ratelimit config: %v", err)
			}
			log.Printf("vigil-proxy: rate-limit config loaded from %s", cfg.RateLimitConfigPath)
		}
		rateLimiter := ratelimit.New(rlCfg, ratelimit.RealClock{})

		pgSrv := &pgproxy.Server{
			ListenAddr:       cfg.PostgresListen,
			UpstreamAddr:     cfg.PostgresUpstream,
			Logger:           log.Default(),
			AuditWriter:      auditWriter,
			IdentityVerifier: iss,
			RateLimiter:      rateLimiter,
			Coalescer:        coalesceCache,
		}
		log.Printf("coalesce: per-agent cache armed with %s TTL", cfg.CoalesceTTL)
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := pgSrv.ListenAndServe(ctx); err != nil {
				log.Printf("pgproxy error: %v", err)
				stop()
			}
		}()
	}

	<-ctx.Done()
	log.Println("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	httpErr := httpSrv.Shutdown(shutdownCtx)

	// pgproxy.Server.ListenAndServe exits when ctx is canceled (which
	// signal.NotifyContext just did via stop()). Give it a moment to
	// drain before we return.
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		log.Println("shutdown timeout — proceeding")
	}
	return httpErr
}

// runMCPStdio runs the MCP JSON-RPC server on stdin/stdout. Logs go to
// stderr because the MCP host parses Content-Length frames off stdout —
// any stray log line there would desync the wire format. We also
// pre-open audit.Open to ensure the schema exists; that lets a fresh
// install (where pgproxy has never run) get empty results from
// activity.query instead of a "no such table" error.
func runMCPStdio(cfg *config.Config, iss *identity.Issuer) error {
	log.SetOutput(os.Stderr)

	auditWriter, err := audit.Open(cfg.DBPath, iss)
	if err != nil {
		return fmt.Errorf("init audit schema: %w", err)
	}
	auditWriter.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := mcpserver.New(mcpserver.Options{
		Verifier:       iss,
		AuditDBPath:    cfg.DBPath,
		EnvTokenLookup: func() string { return os.Getenv("VIGIL_TOKEN") },
		Logger:         log.Default(),
	})
	log.Printf("vigil-proxy %s — mcp-stdio mode (db=%s key=%s pubkey=%s)",
		config.Version, cfg.DBPath, cfg.KeyPath, iss.PublicKeyB64())
	return srv.Run(ctx, os.Stdin, os.Stdout)
}

// ensureParentDir creates the parent directory of `path` only if it's the
// default ~/.vigil location. For non-default operator-supplied paths we
// leave directory creation to them — the spec says "fail clean if the
// parent dir is missing" and that contract holds for both --db and --key.
func ensureParentDir(path string) error {
	parent := filepath.Dir(path)
	home, err := os.UserHomeDir()
	if err != nil {
		return nil // can't compare; let downstream surface the real error
	}
	defaultDir := filepath.Join(home, ".vigil")
	if parent != defaultDir {
		return nil
	}
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return fmt.Errorf("create %s: %w", parent, err)
	}
	return nil
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
