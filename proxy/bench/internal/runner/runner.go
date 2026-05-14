// Package runner spins up infrastructure (Postgres + proxy), executes
// the workload twice (direct, then through proxy), and aggregates the
// per-arm metrics into a results.RunResult.
package runner

import (
	"context"
	"fmt"
	"net/url"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/costaxanthos/vigil/proxy/bench/internal/results"
	"github.com/costaxanthos/vigil/proxy/bench/internal/workload"
)

// Config drives one full bench run (both arms).
type Config struct {
	Preset      string
	Seed        int64
	Duration    time.Duration
	Concurrency int
	// RepoRoot is the path to the vigil checkout — used to `go build
	// ./cmd/vigil-proxy` for the through-proxy arm.
	RepoRoot string
}

// Run executes the full two-arm bench: schema bootstrap, direct arm,
// proxy arm, percentile aggregation, dedup-rate computation. Returns
// the publishable RunResult.
func Run(ctx context.Context, cfg Config) (results.RunResult, error) {
	pg, err := StartPostgres(ctx)
	if err != nil {
		return results.RunResult{}, fmt.Errorf("start postgres: %w", err)
	}
	defer pg.Cleanup()

	if err := bootstrapSchema(ctx, pg); err != nil {
		return results.RunResult{}, fmt.Errorf("bootstrap schema: %w", err)
	}
	if err := loadVersion(ctx, pg); err != nil {
		return results.RunResult{}, fmt.Errorf("load version: %w", err)
	}

	wallStart := time.Now()

	// ARM 1 — direct connection.
	directDSN := pg.DSN()
	directRes, directIssued, _, err := executeArm(ctx, cfg, directDSN, pg)
	if err != nil {
		return results.RunResult{}, fmt.Errorf("direct arm: %w", err)
	}

	// ARM 2 — through vigil-proxy.
	proxy, err := StartProxy(ctx, pg, cfg.RepoRoot)
	if err != nil {
		return results.RunResult{}, fmt.Errorf("start proxy: %w", err)
	}
	defer func() {
		if proxy.CleanupFn != nil {
			_ = proxy.CleanupFn()
		}
	}()

	// application_name=vigil:<token> is how the proxy attaches an
	// agent identity to this connection. The coalesce hook only fires
	// for non-anonymous connections, so the bench's proxy arm MUST
	// advertise an agent_id. URL-encoded because the token contains
	// characters that aren't safe in a query value otherwise.
	proxyDSN := fmt.Sprintf("postgres://%s:%s@%s/%s?sslmode=disable&application_name=%s",
		pg.User, pg.Password, proxy.ListenAddr, pg.DBName,
		url.QueryEscape("vigil:"+proxy.AgentToken))
	proxyRes, proxyIssued, proxyUpstream, err := executeArm(ctx, cfg, proxyDSN, pg)
	if err != nil {
		return results.RunResult{}, fmt.Errorf("proxy arm: %w", err)
	}

	wallTime := time.Since(wallStart)

	// Honesty check: in pass-through (today), proxy arm's upstream count
	// equals proxy arm's issued count. Every query the client sent reached
	// the upstream. Dedup = 0.
	//
	// When coalescing lands (v0.1.0d), upstream < issued and dedup > 0.
	// We surface BOTH numbers so the website doesn't have to do math.
	_ = directIssued // direct arm's issued count is identical to proxy's
	return results.RunResult{
		Preset:        cfg.Preset,
		Seed:          cfg.Seed,
		Duration:      cfg.Duration,
		Concurrency:   cfg.Concurrency,
		PostgresVer:   pg.Version,
		Hardware:      runtime.GOARCH + "/" + runtime.GOOS,
		TotalIssued:   proxyIssued,
		TotalUpstream: proxyUpstream,
		Direct:        directRes,
		Proxy:         proxyRes,
		WallTime:      wallTime,
	}, nil
}

// bootstrapSchema creates the tables the workload presets reference and
// seeds enough data that lookups don't all return zero rows. We also
// create pg_stat_statements so the proxy arm can count upstream queries.
func bootstrapSchema(ctx context.Context, pg *PostgresHandle) error {
	pool, err := pgxpool.New(ctx, pg.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()

	const ddl = `
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id  TEXT PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    total_cents INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1000 users — matches Production's user-id key universe.
INSERT INTO users (id, email)
SELECT i, 'user-' || i || '@example.com'
FROM generate_series(1, 1000) AS i
ON CONFLICT (id) DO NOTHING;

-- Bump the SERIAL sequence past the explicit IDs we just inserted —
-- otherwise the next auto-id INSERT picks 1 and collides.
SELECT setval('users_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM users), 1000));

-- The 8 emails the Refactor preset hard-codes. Insert with auto-generated
-- ids past 1000 (per the setval above).
INSERT INTO users (email) VALUES
  ('alice@example.com'),
  ('bob@example.com'),
  ('carol@example.com'),
  ('dave@example.com'),
  ('eve@example.com'),
  ('frank@example.com'),
  ('grace@example.com'),
  ('heidi@example.com')
ON CONFLICT (email) DO NOTHING;

-- 1000 sample orders so the analytics preset has something to aggregate.
INSERT INTO orders (user_id, total_cents, created_at)
SELECT
    1 + (i % 1000),
    100 + (i * 13 % 9000),
    now() - ((i % 60) || ' days')::interval
FROM generate_series(1, 1000) AS i;
`
	_, err = pool.Exec(ctx, ddl)
	return err
}

func loadVersion(ctx context.Context, pg *PostgresHandle) error {
	pool, err := pgxpool.New(ctx, pg.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()
	var v string
	if err := pool.QueryRow(ctx, "SELECT version()").Scan(&v); err != nil {
		return err
	}
	pg.Version = v
	return nil
}

// resetStatStatements zeroes pg_stat_statements so the upcoming arm's
// counts represent only this arm. Called at the start of each arm.
func resetStatStatements(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, "SELECT pg_stat_statements_reset()")
	return err
}

// readUpstreamCalls sums pg_stat_statements.calls for queries that look
// like the bench's workload. Filtering by query LIKE patterns keeps
// pg_stat_statements_reset's own SELECT and any background DDL out of
// the count.
func readUpstreamCalls(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	var n int64
	const q = `
SELECT COALESCE(SUM(calls), 0)::bigint
FROM pg_stat_statements
WHERE query ILIKE 'SELECT % FROM users %'
   OR query ILIKE 'SELECT % FROM sessions %'
   OR query ILIKE 'SELECT % FROM orders %'
   OR query ILIKE 'SELECT % FROM information_schema%'
`
	if err := pool.QueryRow(ctx, q).Scan(&n); err != nil {
		return 0, err
	}
	return int(n), nil
}

// executeArm runs the workload for cfg.Duration against `dsn`, captures
// per-query latencies, and reads upstream call counts from
// pg_stat_statements. Returns:
//   - the per-arm summary (latencies + throughput + errors)
//   - the total queries issued by clients in this arm
//   - the total queries that reached upstream (= calls in
//     pg_stat_statements; for direct arm same as issued, for proxy arm
//     potentially less when coalescing lands)
func executeArm(
	ctx context.Context,
	cfg Config,
	dsn string,
	pg *PostgresHandle,
) (results.ArmResult, int, int, error) {
	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return results.ArmResult{}, 0, 0, fmt.Errorf("parse pool dsn: %w", err)
	}
	poolCfg.MaxConns = int32(cfg.Concurrency * 2)
	// Force pgx to use Postgres simple-protocol Query messages instead of
	// the default Parse+Bind+Execute pipeline. v0.1.0d's coalesce hook
	// inspects 'Q' frames; extended-protocol coalescing is a follow-up.
	// This is a benchmark-side choice (not a product constraint) — agent
	// traffic is overwhelmingly simple-protocol in practice (psql, raw
	// query strings from LLMs, etc.).
	poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return results.ArmResult{}, 0, 0, fmt.Errorf("pool: %w", err)
	}
	defer pool.Close()

	// Always reset pg_stat_statements through a DIRECT pool — calling
	// it through the proxy works too, but keeping it direct means we
	// reset the stats even if the proxy arm fails to connect.
	statsPool, err := pgxpool.New(ctx, pg.DSN())
	if err != nil {
		return results.ArmResult{}, 0, 0, fmt.Errorf("stats pool: %w", err)
	}
	defer statsPool.Close()
	if err := resetStatStatements(ctx, statsPool); err != nil {
		return results.ArmResult{}, 0, 0, fmt.Errorf("reset stats: %w", err)
	}

	gen := newGenerator(cfg)

	armCtx, cancel := context.WithTimeout(ctx, cfg.Duration)
	defer cancel()

	var (
		latMu     sync.Mutex
		latencies []time.Duration
		issued    atomic.Int64
		errs      atomic.Int64
	)

	var wg sync.WaitGroup
	armStart := time.Now()
	for w := 0; w < cfg.Concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Each goroutine pulls from the same generator. The runner
			// holds gen.mu so two goroutines can't race the RNG — that
			// would break determinism. Concurrency in this harness is
			// "many connections firing the deterministic stream in
			// parallel," not "many independent streams interleaving."
			for {
				select {
				case <-armCtx.Done():
					return
				default:
				}
				q, ok := gen.Next()
				if !ok {
					return
				}
				start := time.Now()
				rows, err := pool.Query(armCtx, q.SQL, q.Params...)
				if err != nil {
					if armCtx.Err() != nil {
						return
					}
					errs.Add(1)
					continue
				}
				// Drain rows so the wire round-trip is complete before
				// we record latency.
				for rows.Next() {
				}
				rows.Close()
				lat := time.Since(start)

				latMu.Lock()
				latencies = append(latencies, lat)
				latMu.Unlock()
				issued.Add(1)
			}
		}()
	}
	wg.Wait()
	wall := time.Since(armStart)

	upstream, err := readUpstreamCalls(ctx, statsPool)
	if err != nil {
		return results.ArmResult{}, 0, 0, fmt.Errorf("read stats: %w", err)
	}

	pcts := results.Percentiles(latencies)
	throughput := 0.0
	if wall > 0 {
		throughput = float64(issued.Load()) / wall.Seconds()
	}

	return results.ArmResult{
		P50:        pcts.P50,
		P95:        pcts.P95,
		P99:        pcts.P99,
		Throughput: throughput,
		Errors:     int(errs.Load()),
	}, int(issued.Load()), upstream, nil
}

// safeGen wraps a workload.Generator in a mutex so the runner's
// concurrent goroutines can share one deterministic stream. Without
// the mutex two goroutines reading from the RNG simultaneously would
// race and break determinism — the bench would emit a different
// query order on every run, defeating the published-seed promise.
type safeGen struct {
	mu  sync.Mutex
	gen workload.Generator
}

func (s *safeGen) Next() (workload.Query, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.gen.Next()
}

func newGenerator(cfg Config) *safeGen {
	wcfg := workload.Config{Seed: cfg.Seed, Concurrency: cfg.Concurrency}
	var inner workload.Generator
	switch cfg.Preset {
	case "mixed":
		inner = workload.NewMixed(wcfg)
	case "production":
		inner = workload.NewProduction(wcfg)
	default: // "refactor" or empty
		inner = workload.NewRefactor(wcfg)
	}
	return &safeGen{gen: inner}
}
