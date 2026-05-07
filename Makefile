# Vigil — top-level Makefile.
#
# Targets are deliberately minimal. Each subsystem (daemon, app, proxy)
# already has its own build / test commands; the Makefile is the
# zero-friction entry point for cross-cutting tasks.

.PHONY: bench bench-help

# Run the coalescing benchmark end-to-end. Spins ephemeral Postgres in
# Docker (or honors BENCH_PG_URL), runs the workload twice (direct then
# through-proxy), writes proxy/bench/RESULTS.md and results.json.
#
# Examples:
#   make bench
#   BENCH_PRESET=refactor make bench
#   BENCH_DURATION=30s BENCH_CONCURRENCY=8 make bench
#   BENCH_PG_URL=postgres://postgres:test@localhost:5432/postgres make bench
bench:
	@bash proxy/bench/scripts/run.sh

bench-help:
	@bash proxy/bench/scripts/run.sh --help
