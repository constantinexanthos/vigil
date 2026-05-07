package workload

import (
	"reflect"
	"testing"
)

// drain pulls the first n queries off a generator's channel and returns
// them. The harness uses bounded streams (a duration cap), but for tests
// we just take a snapshot of the first 50 queries — that's enough to
// detect divergence between two runs of the same seed.
func drain(t *testing.T, gen Generator, n int) []Query {
	t.Helper()
	out := make([]Query, 0, n)
	for i := 0; i < n; i++ {
		q, ok := gen.Next()
		if !ok {
			t.Fatalf("generator exhausted at %d, wanted %d", i, n)
		}
		out = append(out, q)
	}
	return out
}

// Same seed → same query stream. This is the contract the README will
// promise: "BENCH_SEED=42 reproduces the exact same workload."
//
// If this regresses, every published RESULTS.md becomes a snapshot of an
// unrepeatable run. The fix is non-negotiable: lock the seeded RNG path.
func TestRefactorIsDeterministicWithSameSeed(t *testing.T) {
	a := NewRefactor(Config{Seed: 42, Concurrency: 4})
	b := NewRefactor(Config{Seed: 42, Concurrency: 4})

	got := drain(t, a, 50)
	want := drain(t, b, 50)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("seeded streams diverged:\n  first  = %v\n  second = %v", got, want)
	}
}

// Different seeds should produce different streams. This is a smoke check
// that the seed actually wires into the RNG — without it, "seeded" could
// silently be a no-op.
func TestRefactorDifferentSeedsDiverge(t *testing.T) {
	a := drain(t, NewRefactor(Config{Seed: 1, Concurrency: 4}), 50)
	b := drain(t, NewRefactor(Config{Seed: 2, Concurrency: 4}), 50)

	if reflect.DeepEqual(a, b) {
		t.Fatal("seed 1 and seed 2 produced identical streams; seed not wired into RNG")
	}
}

// The refactor preset's whole point: the SAME query is fired many times.
// If unique-query rate is high, coalescing has nothing to coalesce — the
// preset would not be exercising the thing the website claims.
//
// Concretely: most of the workload is `SELECT * FROM users WHERE email = $1`
// against a small key space, with 10% schema queries. Among the user
// queries, distinct (sql, params) tuples must be a small fraction.
func TestRefactorHasHighDuplicateRate(t *testing.T) {
	gen := NewRefactor(Config{Seed: 42, Concurrency: 4})
	sample := drain(t, gen, 200)

	uniq := make(map[string]struct{})
	for _, q := range sample {
		key := q.SQL
		for _, p := range q.Params {
			key += "|"
			key += toString(p)
		}
		uniq[key] = struct{}{}
	}
	// ≤ 30 unique tuples among 200 queries → ≥ 85% potential dedup.
	// The refactor preset deliberately models an agent that re-fires the
	// same query against a small key universe.
	if len(uniq) > 30 {
		t.Errorf("refactor preset has too many unique queries: %d/200 (want ≤ 30)", len(uniq))
	}
}

func toString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case int, int64, float64, bool:
		return formatPrimitive(v)
	default:
		return formatPrimitive(v)
	}
}

func formatPrimitive(v any) string {
	switch x := v.(type) {
	case int:
		return itoa(x)
	case int64:
		return itoa(int(x))
	default:
		_ = x
		return "?"
	}
}

// Mixed = refactor traffic + a slow analytics query. The same-seed
// determinism contract applies; production teams need to be able to
// reproduce the published numbers from the README, not just refactor's.
func TestMixedIsDeterministicWithSameSeed(t *testing.T) {
	a := drain(t, NewMixed(Config{Seed: 42, Concurrency: 4}), 50)
	b := drain(t, NewMixed(Config{Seed: 42, Concurrency: 4}), 50)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("mixed seed=42 streams diverged")
	}
}

// Mixed must include both refactor-shaped queries AND the slow analytics
// query. Otherwise it's just renamed refactor and doesn't model the
// "concrete scenario" the website talks about.
func TestMixedIncludesAnalytics(t *testing.T) {
	gen := NewMixed(Config{Seed: 42, Concurrency: 4})
	sample := drain(t, gen, 200)

	sawAnalytics := false
	sawRefactor := false
	for _, q := range sample {
		if q.Tag == "analytics_orders_by_day" {
			sawAnalytics = true
		}
		if q.Tag == "user_lookup" {
			sawRefactor = true
		}
	}
	if !sawAnalytics {
		t.Error("mixed preset never emitted an analytics query in 200 samples")
	}
	if !sawRefactor {
		t.Error("mixed preset never emitted a refactor user_lookup in 200 samples")
	}
}

// Production = low-rate baseline traffic representative of human web
// requests against the same DB. Determinism contract still applies; the
// "production untouched" claim is on the website and we want to be able
// to reproduce it.
func TestProductionIsDeterministicWithSameSeed(t *testing.T) {
	a := drain(t, NewProduction(Config{Seed: 42, Concurrency: 4}), 50)
	b := drain(t, NewProduction(Config{Seed: 42, Concurrency: 4}), 50)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("production seed=42 streams diverged")
	}
}

// Production traffic should NOT collapse on a coalescer — the whole
// point of separating it is "human-shaped requests run untouched while
// agent-shaped requests get coalesced." So unique-rate among 200
// production queries should be HIGH.
func TestProductionHasLowDuplicateRate(t *testing.T) {
	gen := NewProduction(Config{Seed: 42, Concurrency: 4})
	sample := drain(t, gen, 200)

	uniq := make(map[string]struct{})
	for _, q := range sample {
		key := q.SQL
		for _, p := range q.Params {
			key += "|" + toString(p)
		}
		uniq[key] = struct{}{}
	}
	// Production traffic ranges over a much larger key universe — the
	// preset uses 1000 user IDs and a longer SQL menu. ≥ 100 unique
	// among 200 = ~50%+ unique = roughly human-traffic-shaped.
	if len(uniq) < 100 {
		t.Errorf("production preset has too few unique queries: %d/200 (want ≥ 100)", len(uniq))
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	negative := n < 0
	if negative {
		n = -n
	}
	digits := make([]byte, 0, 10)
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if negative {
		return "-" + string(digits)
	}
	return string(digits)
}
