#!/usr/bin/env bash
# Run the Vigil coalescing benchmark end-to-end.
#
# Defaults:
#   BENCH_PRESET=all (refactor, mixed, production)
#   BENCH_DURATION=10s per arm
#   BENCH_CONCURRENCY=4
#   BENCH_SEED=42
#
# Override any of those via the environment.
#
# Output: writes proxy/bench/RESULTS.md and proxy/bench/results.json.
#
# Setup:
#   - Docker must be running (the runner spins ephemeral Postgres on
#     a random high port). If you have a Postgres reachable elsewhere,
#     set BENCH_PG_URL=postgres://user:pass@host:port/db and the runner
#     will use that instead. pg_stat_statements must be enabled there.

set -euo pipefail

# Repo root = parent of proxy/, two levels up from this script.
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

cd "$REPO_ROOT/proxy"

# Ensure pgx and friends are downloaded — first-run users without a
# warm module cache pay this cost once.
go mod download

# go run beats `go build && exec` for a one-shot tool.
exec go run ./bench/cmd/vigil-bench \
  --out-dir "$REPO_ROOT/proxy/bench" \
  --repo-root "$REPO_ROOT" \
  "$@"
