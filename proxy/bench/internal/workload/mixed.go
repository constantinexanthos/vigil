package workload

import "math/rand/v2"

// Mixed is the website's "concrete scenario": refactor-style duplicate
// SELECTs running concurrently with a slow analytics query. ~85% of
// the stream is refactor traffic; ~15% is the analytics query, which
// is structurally a low-cardinality query but expensive to execute.
//
// The whole point: a coalescer should collapse the refactor traffic
// dramatically while leaving the (already-rare) analytics query alone.
type Mixed struct {
	rng      *rand.Rand
	refactor *Refactor
}

const mixedAnalyticsSQL = "SELECT count(*) AS n, date_trunc('day', created_at) AS day FROM orders WHERE created_at >= $1 GROUP BY day ORDER BY day DESC"

// NewMixed builds a deterministic mixed-traffic generator.
func NewMixed(cfg Config) *Mixed {
	return &Mixed{
		rng:      newRNG(cfg.Seed ^ 0xA1B2C3D4), // distinct stream than Refactor's
		refactor: NewRefactor(Config{Seed: cfg.Seed, Concurrency: cfg.Concurrency}),
	}
}

// Next emits one query. 85% refactor, 15% analytics.
func (m *Mixed) Next() (Query, bool) {
	roll := m.rng.IntN(100)
	if roll < 15 {
		// One of three since-cutoffs, so an analytics coalescer (future)
		// could see partial dedup on the parameter level too. Same shape
		// as the website's "concrete scenario" copy.
		cutoffs := []string{"2026-04-01", "2026-04-15", "2026-05-01"}
		return Query{
			SQL:    mixedAnalyticsSQL,
			Params: []any{cutoffs[m.rng.IntN(len(cutoffs))]},
			Tag:    "analytics_orders_by_day",
		}, true
	}
	return m.refactor.Next()
}
