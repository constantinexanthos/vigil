package runner

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"
)

// PostgresHandle describes how to reach a Postgres the runner should
// use. It either points at an externally-provided server (BENCH_PG_URL)
// or at one we just spun up in Docker — the runner doesn't care which.
type PostgresHandle struct {
	// Host:port for client TCP connections.
	Host string
	Port int
	// User / password / dbname to use when connecting.
	User     string
	Password string
	DBName   string

	// CleanupFn tears down whatever StartPostgres allocated. Nil when
	// using an external server.
	CleanupFn func() error
	// Version is the reported `SELECT version()` of the server.
	// Filled in after the first successful connection.
	Version string
}

// DSN returns a libpq-compatible connection string for pgx.
func (h *PostgresHandle) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		h.User, h.Password, h.Host, h.Port, h.DBName)
}

// Cleanup is safe to call even on external-server handles (no-op).
func (h *PostgresHandle) Cleanup() error {
	if h.CleanupFn == nil {
		return nil
	}
	return h.CleanupFn()
}

// StartPostgres returns a usable handle. It first checks BENCH_PG_URL —
// if set, it's parsed and returned without a Docker spin-up (the
// "shipping a reliable harness with a documented dependency beats
// shipping a flaky one" path). Otherwise it spins ephemeral Postgres
// in Docker on a high port, polled until ready.
func StartPostgres(ctx context.Context) (*PostgresHandle, error) {
	if url := os.Getenv("BENCH_PG_URL"); url != "" {
		return parseExternalDSN(url)
	}
	return startDockerPostgres(ctx)
}

// parseExternalDSN handles the BENCH_PG_URL shortcut. Accepts the libpq
// URL form `postgres://user:pass@host:port/dbname`. Anything else
// returns an error rather than guessing — operators who set this
// variable want it respected as-is.
func parseExternalDSN(raw string) (*PostgresHandle, error) {
	if !strings.HasPrefix(raw, "postgres://") && !strings.HasPrefix(raw, "postgresql://") {
		return nil, fmt.Errorf("BENCH_PG_URL must be postgres:// URL, got %q", raw)
	}
	// Strip the prefix.
	tail := strings.TrimPrefix(strings.TrimPrefix(raw, "postgresql://"), "postgres://")
	// Optional ?... query: drop it for parsing host/db.
	if i := strings.Index(tail, "?"); i >= 0 {
		tail = tail[:i]
	}
	// user:pass@host:port/dbname
	at := strings.LastIndex(tail, "@")
	if at < 0 {
		return nil, fmt.Errorf("BENCH_PG_URL missing user@host: %q", raw)
	}
	cred, rest := tail[:at], tail[at+1:]
	user, pass, _ := strings.Cut(cred, ":")
	hostPort, dbname, _ := strings.Cut(rest, "/")
	host, portStr, _ := strings.Cut(hostPort, ":")
	if portStr == "" {
		portStr = "5432"
	}
	port, err := atoi(portStr)
	if err != nil {
		return nil, fmt.Errorf("BENCH_PG_URL bad port %q: %w", portStr, err)
	}
	if dbname == "" {
		dbname = "postgres"
	}
	return &PostgresHandle{
		Host:     host,
		Port:     port,
		User:     user,
		Password: pass,
		DBName:   dbname,
	}, nil
}

// startDockerPostgres runs a Postgres 16 container on a random high
// port, with pg_stat_statements preloaded so the runner can count how
// many queries actually reached upstream.
func startDockerPostgres(ctx context.Context) (*PostgresHandle, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return nil, fmt.Errorf("docker not found on PATH; set BENCH_PG_URL to use an external Postgres: %w", err)
	}

	port := 25432 + rand.IntN(10000) // avoid colliding with whatever else is bound
	name := fmt.Sprintf("vigil-bench-pg-%d", port)
	password := "vigil-bench"

	cmd := exec.CommandContext(ctx, "docker", "run", "-d",
		"--rm",
		"--name", name,
		"-e", "POSTGRES_PASSWORD="+password,
		"-p", fmt.Sprintf("%d:5432", port),
		"postgres:16",
		"-c", "shared_preload_libraries=pg_stat_statements",
		"-c", "pg_stat_statements.track=all",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("docker run: %w\noutput: %s", err, out)
	}

	cleanup := func() error {
		c := exec.Command("docker", "rm", "-f", name)
		_ = c.Run()
		return nil
	}

	handle := &PostgresHandle{
		Host:      "localhost",
		Port:      port,
		User:      "postgres",
		Password:  password,
		DBName:    "postgres",
		CleanupFn: cleanup,
	}

	// Wait for ready. Two-stage: pg_isready inside the container (cheap,
	// fails fast) + a real TCP connect to the host-mapped port (catches
	// the race where pg_isready returns OK during initdb but the
	// external port isn't accepting traffic yet — bit us once).
	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		probe := exec.CommandContext(ctx, "docker", "exec", name, "pg_isready", "-U", "postgres")
		if err := probe.Run(); err != nil {
			select {
			case <-ctx.Done():
				_ = cleanup()
				return nil, ctx.Err()
			case <-time.After(250 * time.Millisecond):
			}
			continue
		}
		// pg_isready OK — confirm the host-mapped port really accepts.
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", port), 500*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			// Add one more 250ms grace so the postmaster has time to
			// accept SQL after the TCP handshake. Without this we still
			// occasionally see connection-reset on the very first query.
			time.Sleep(500 * time.Millisecond)
			return handle, nil
		}
		select {
		case <-ctx.Done():
			_ = cleanup()
			return nil, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	_ = cleanup()
	return nil, errors.New("postgres container did not become ready within 45s")
}

func atoi(s string) (int, error) {
	n := 0
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("non-digit %q", c)
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}
