package workload

import (
	"fmt"
	"math/rand/v2"
)

// Production models the human-traffic baseline that runs in a separate
// connection pool. The website's claim is "production traffic runs
// untouched" — so this preset must NOT have the high-duplicate shape
// the agent presets do. A coalescer aimed at agent traffic should leave
// these queries alone, not because of policy but because they're
// structurally not duplicates.
//
// Implementation: queries against a 1000-user-ID universe, plus a few
// per-session reads. Cardinality is high enough that ≥50% of any
// 200-query window is unique.
type Production struct {
	rng *rand.Rand
}

// NewProduction builds the deterministic baseline-traffic generator.
func NewProduction(cfg Config) *Production {
	return &Production{rng: newRNG(cfg.Seed ^ 0xDEADBEEF)}
}

const (
	productionUserByIDSQL    = "SELECT id, email, created_at FROM users WHERE id = $1"
	productionSessionByIDSQL = "SELECT user_id, last_seen FROM sessions WHERE session_id = $1"
	productionRecentOrdersSQL = "SELECT id, total_cents FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10"
	productionCountByDaySQL   = "SELECT count(*) FROM orders WHERE user_id = $1 AND created_at >= $2"
)

const productionUserSpace = 1000 // wide enough that 200 picks is mostly unique

// Next emits one query. Roughly:
//   - 40% user-by-id (large key space)
//   - 30% session-by-session-id
//   - 20% recent-orders (bound to a user_id)
//   - 10% count-by-day (user_id × cutoff)
func (p *Production) Next() (Query, bool) {
	roll := p.rng.IntN(100)
	switch {
	case roll < 40:
		uid := p.rng.IntN(productionUserSpace) + 1
		return Query{SQL: productionUserByIDSQL, Params: []any{uid}, Tag: "prod_user_by_id"}, true
	case roll < 70:
		// session IDs are stringy in real life; mimic a UUID-ish shape
		// while staying RNG-deterministic.
		sid := fmt.Sprintf("sess-%08x", p.rng.Uint32())
		return Query{SQL: productionSessionByIDSQL, Params: []any{sid}, Tag: "prod_session_lookup"}, true
	case roll < 90:
		uid := p.rng.IntN(productionUserSpace) + 1
		return Query{SQL: productionRecentOrdersSQL, Params: []any{uid}, Tag: "prod_recent_orders"}, true
	default:
		uid := p.rng.IntN(productionUserSpace) + 1
		cutoffs := []string{"2026-04-01", "2026-04-15", "2026-05-01"}
		return Query{
			SQL:    productionCountByDaySQL,
			Params: []any{uid, cutoffs[p.rng.IntN(len(cutoffs))]},
			Tag:    "prod_count_by_day",
		}, true
	}
}
