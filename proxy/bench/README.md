# vigil-bench — coalescing benchmark harness

Reproducible test that measures Vigil's coalescing benefit against real Postgres on a synthetic-but-realistic agent workload.

The website claims **40–80% cost reduction from coalescing**. This harness is the artifact that backs the claim. Today, before coalescing ships, the proxy is bytes-equivalent passthrough — so the harness reports **dedup rate ≈ 0%** as a sanity check that the measurement pipeline is honest. Once the coalescing logic lands (v0.1.0d), the same harness re-runs against the same seed and publishes the actual reduction.

## Quick start

```bash
make bench
```

Defaults: 5s per arm, concurrency 4, seed 42, all three presets. Total wall time on a developer laptop with Docker warm: ~45s.

Override via environment for higher-confidence numbers:

```bash
BENCH_PRESET=refactor BENCH_DURATION=30s BENCH_CONCURRENCY=8 make bench
```

**For publication-quality results** (Show HN, website hero), use `BENCH_DURATION=30s`. The default 5s gives ~50k queries per arm — already plenty for stable p50/p95 — but 30s smooths p99 tail noise and makes the comparison harder to dismiss.

Outputs:

- `proxy/bench/RESULTS.md` — human-readable, copy-paste-into-the-website friendly
- `proxy/bench/results.json` — machine-readable, ingestible by site / dashboards

## Setup

You need either:

1. **Docker.** The runner spins an ephemeral `postgres:16` container with `pg_stat_statements` preloaded. The default and zero-config path. Spin-up is ~5–10s.

2. **An existing Postgres.** Set `BENCH_PG_URL=postgres://user:pass@host:port/db`. The harness skips Docker and connects to your DB. **`pg_stat_statements` must be enabled** — without it the harness can't count upstream queries and dedup rate becomes meaningless. Enable with:

   ```sql
   ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
   -- restart postgres
   CREATE EXTENSION pg_stat_statements;
   ```

## Presets

| Preset | Models | Distinguishing trait |
|---|---|---|
| `refactor` | A coding agent re-fetching the same handful of records during an iteration | ≥85% potential dedup — small key universe (8 emails), 90% identical SELECTs |
| `mixed` | The website's "concrete scenario" — refactor traffic plus a slow analytics aggregate running concurrently | 85% refactor + 15% analytics |
| `production` | Human-shaped baseline traffic from the production app's connection pool | High cardinality (1000-user-id key space) — coalescing should leave it alone |

All three are deterministic when seeded — same `BENCH_SEED` reproduces the same query stream byte-for-byte. The harness publishes the seed in `RESULTS.md` so anyone can re-run.

## How to interpret results

For each preset, `RESULTS.md` shows:

- **Volume & dedup** — `Total queries issued` is what clients sent. `Queries hitting upstream` is what reached Postgres (counted from `pg_stat_statements`). `Dedup rate = 1 − upstream / issued`. Today (passthrough), they're equal and dedup is 0%.
- **Latency** — `p50`, `p95`, `p99` per arm; `Throughput` in queries/second; `Errors` (queries that failed — connection drop, timeout, query error).
- **Added latency through proxy** — proxy `p50` minus direct `p50`, same for `p99`. The bar Agent 1's perf bar should beat: < 1ms p50, < 5ms p99 (per the design spec).

## Adding a new preset

Three steps:

1. **Define the workload generator.** Create `proxy/bench/internal/workload/<preset>.go`. Implement the `Generator` interface — one method, `Next() (Query, bool)`. Seed your RNG via `newRNG(cfg.Seed ^ <distinguishing-uint64>)` so your stream is independent of the other presets'.

2. **Add a determinism test.** In `proxy/bench/internal/workload/workload_test.go`, mirror `TestRefactorIsDeterministicWithSameSeed` for your new preset. The harness's whole credibility depends on every preset being reproducible from a published seed.

3. **Wire it into the runner.** Add a case to `newGenerator` in `proxy/bench/internal/runner/runner.go`. Add the preset name to the all-presets list in `proxy/bench/cmd/vigil-bench/main.go`.

If your preset needs new tables or seed data, extend the `bootstrapSchema` SQL in `runner.go` — keep the additions idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) so re-runs against an existing Postgres don't blow up.

## Architecture

```
cmd/vigil-bench/         entry point — flag parsing, orchestrates one run per preset
internal/workload/       deterministic query generators (one Go file per preset)
internal/runner/         Docker / proxy spin-up, two-arm execution, pg_stat_statements counts
internal/results/        latency percentiles, dedup math, JSON + Markdown emit
scripts/run.sh           wrapper invoked by `make bench`
```

The runner does both arms in sequence:

1. `StartPostgres` — Docker container or `BENCH_PG_URL`.
2. `bootstrapSchema` — `users`, `sessions`, `orders` tables + 1000-row seed data + `pg_stat_statements`.
3. **Arm 1: direct** — connect to Postgres directly. Run workload for `BENCH_DURATION`. Capture latencies. Read `pg_stat_statements.calls`.
4. `StartProxy` — build vigil-proxy, run on a high port pointed at Postgres.
5. **Arm 2: through proxy** — connect to the proxy. Same workload (same seed). Capture latencies. Read `pg_stat_statements.calls`.
6. Aggregate. Write `RESULTS.md` and `results.json`.

`pg_stat_statements` is reset before each arm so the count reflects only that arm's traffic.

## Determinism caveat

Within an arm, all `BENCH_CONCURRENCY` goroutines pull from a **shared** generator behind a mutex. This guarantees the byte-stream of queries is identical across runs of the same seed — the alternative (one generator per goroutine, each seeded differently) would produce non-deterministic interleaving under different scheduler decisions.

The cost: the goroutines are racing for the mutex on every `Next()`. With `concurrency=4` and per-query latencies in the millisecond range, the lock is uncontended in practice. If we ever need higher concurrency or want zero contention, a fixed-N partitioned RNG approach would work — out of scope for the v0 harness.
