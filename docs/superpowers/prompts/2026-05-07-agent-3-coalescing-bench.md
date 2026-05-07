# Conductor Prompt — Agent 3: coalescing benchmark harness

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to build the reproducible benchmark harness that proves the website's "40–80% cost reduction from coalescing" claim. Real Postgres in Docker, synthetic-but-realistic agent workload, measure with vs without proxy.

**This is the venture-grade artifact.** A reproducible test with public results turns "we think coalescing helps" into "we measured 67% reduction on this workload, here's the test, run it yourself." The output of your work is the homepage hero number, the Show HN top comment, and the email subject line.

**Two other agents are working in parallel.** Agent 1 is rewriting the proxy's Postgres relay to attach identity and write audit rows. Agent 2 is building a Tauri tab that visualizes audit data. Neither overlaps with your files.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec.
2. `docs/superpowers/specs/2026-05-07-three-agent-push-design.md` — this push's design, including your full scope.
3. `proxy/README.md` — current v0.1.0a state. The proxy is currently bytes-equivalent passthrough. Your harness today reports dedup rate ≈ 0% — that's correct and expected.
4. The website's "concrete scenario" copy on `bevigil.ai` — this is the workload shape you're modeling.

## What you ship

A complete benchmark harness in `proxy/bench/` that:

1. Spins up an ephemeral Postgres in Docker (or uses an existing one if `BENCH_PG_URL` is set).
2. Runs a configurable, deterministic workload generator against either the upstream directly or through the proxy.
3. Captures per-query latency, total queries issued, queries that hit upstream, dedup rate, p50/p95/p99 latency, throughput, end-to-end wall time.
4. Emits `proxy/bench/RESULTS.md` and `proxy/bench/results.json`.
5. Is invokable end-to-end via `make bench` from the repo root.

## Workload shape

Three presets, all deterministic with a seed:

- **`refactor`** — heavy duplicate SELECTs. Models an agent that "rediscovers" the same query: `SELECT * FROM users WHERE email = $1` fired 200 times in 30 seconds against the same key. Plus 10% schema queries (`information_schema.columns`). The high-coalescing-payoff preset.
- **`mixed`** — refactor traffic + a slow analytics query (`SELECT count(*), date_trunc(...) FROM orders GROUP BY ...`) running concurrently. Models the website's "concrete scenario."
- **`production`** — low-rate baseline traffic representative of human web traffic running in a separate connection pool. Models the "production untouched" claim.

Configurable via flags or env vars: `BENCH_PRESET`, `BENCH_DURATION` (default 30s), `BENCH_CONCURRENCY` (default per-preset), `BENCH_SEED` (default 42).

## Workload determinism

Same seed → same query order → same parameters. Critical for reproducibility. Use a seeded PRNG. Document the seed in `RESULTS.md`.

## Files you own

- `proxy/bench/` — new directory: the entire harness.
  - `proxy/bench/cmd/vigil-bench/main.go` — entry point.
  - `proxy/bench/internal/workload/` — workload generators (one file per preset).
  - `proxy/bench/internal/runner/` — Docker spin-up, two-arm comparison, results capture.
  - `proxy/bench/scripts/run.sh` — wrapper for `make bench`.
  - `proxy/bench/README.md` — what it does, how to run, how to interpret results.
- Root `Makefile` — additive only: a new `bench` target. If `Makefile` doesn't exist, create it.

## Files you MUST NOT touch

- `proxy/internal/` — Agent 1's territory.
- `app/` — Agent 2's territory.
- `daemon/`, `site/` — out of scope.
- Existing `proxy/scripts/smoke-postgres.sh` — leave it alone.

## Acceptance criteria

1. **End-to-end run.** `make bench` runs end-to-end in <60s on a developer laptop with Docker available, against ephemeral Postgres.
2. **All three presets.** Each preset runs and emits results.
3. **Sanity check.** Today (pass-through proxy) reports dedup rate within 0% ± 0.5% — this confirms the harness is honest and not double-counting.
4. **Latency overhead reported.** Through-proxy vs direct comparison reports added latency p50 and p99. Informs Agent 1's perf bar.
5. **Reproducibility.** Same seed produces same query stream. Test this — run twice, assert identical query parameters.
6. **Results format.** `RESULTS.md` is human-readable and copy-pasteable into the website. Include: test config (preset, duration, concurrency, seed), Postgres version, hardware, total queries, queries hitting upstream, dedup rate, p50/p95/p99 latency direct, p50/p95/p99 latency through proxy, throughput direct, throughput through proxy.

## Stretch (only if you finish early)

If Agent 1's audit table is populated by the time you finish the harness, add a fourth preset: `audited` — same as `refactor` but with `application_name=vigil:<token>`. Measure the audit-write overhead. Report in `RESULTS.md`. Do not block on Agent 1 — `audited` is purely additive.

## Out of scope (do not implement)

- The actual coalescing logic in the proxy (that's v0.1.0d).
- Redis or HTTP workloads (Postgres-only for v0).
- Continuous benchmarking / regression detection (a future workstream).
- Pretty graphs (Markdown table is fine; site team will visualize later).

## How to know you are done

- `make bench` works on a clean checkout with Docker.
- `RESULTS.md` is publishable copy.
- README in `proxy/bench/` explains how to add a new preset.
- All acceptance criteria pass.

## When you finish

Open a PR against `main`, request review from the lead agent. Your work can merge anytime — it's independent of Agents 1 and 2.

## When you get stuck

The most likely stuck point is Docker spin-up timing or pg_isready loops. If your harness becomes flaky in CI, fall back to assuming `BENCH_PG_URL` is set and document a quickstart for running Postgres separately. Shipping a reliable harness with a documented dependency beats shipping a flaky one with full automation.
