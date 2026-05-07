// Package workload defines the deterministic agent-traffic generators
// the benchmark drives Postgres with.
//
// Each preset produces a sequence of (SQL, params) tuples representing
// queries an AI coding agent might fire. Every generator is deterministic
// when seeded — same Config.Seed reproduces the same byte-equivalent
// stream of queries, so RESULTS.md can claim "BENCH_SEED=42" and mean it.
package workload

// Query is one unit of the workload — what gets sent over the wire.
// Pgx executes these as parameterized queries; the same SQL with
// different params is a distinct query for stat purposes but the same
// query from a coalescer's perspective when params match.
type Query struct {
	SQL    string
	Params []any
	// Tag groups queries for reporting. Used to report e.g. "200 user
	// lookups + 20 schema reads" without having to parse SQL strings.
	Tag string
}

// Config tunes a generator at construction time. All presets accept the
// same shape so the runner can swap presets via a single switch.
type Config struct {
	// Seed makes the stream deterministic. Same seed → same params,
	// same call ordering (when used from a single goroutine).
	Seed int64
	// Concurrency is the number of goroutines the runner will fire
	// queries from in parallel. Generators that interleave query types
	// across goroutines (e.g. mixed) read this to weight the output.
	// Refactor and production currently ignore it — the field is here
	// so all presets share one Config shape.
	Concurrency int
}

// Generator emits Queries until it decides to stop. The runner reads
// from one Generator per goroutine; a Generator must be safe to call
// from a single goroutine but does NOT need to be safe across goroutines.
//
// Returning ok=false signals the generator has voluntarily exhausted —
// not used by the bench today (the duration cap stops things) but kept
// in the contract so a "fixed-N-queries" preset could plug in later.
type Generator interface {
	Next() (Query, bool)
}
