package workload

import "math/rand/v2"

// refactorEmails is the small key universe the "refactor" preset draws
// user lookups from. The whole point of the preset is to model an agent
// that "rediscovers" the same handful of records — a coalescer should
// see most queries collapse into a few unique (sql, params) tuples.
//
// 8 emails × 1 SQL template = 8 distinct user-query tuples. Plus 2
// schema queries → ~10 unique tuples in the ideal case.
var refactorEmails = []string{
	"alice@example.com",
	"bob@example.com",
	"carol@example.com",
	"dave@example.com",
	"eve@example.com",
	"frank@example.com",
	"grace@example.com",
	"heidi@example.com",
}

const (
	refactorUserSQL = "SELECT id, email, created_at FROM users WHERE email = $1"
	// information_schema is the canonical "what's the shape of this DB"
	// query an agent fires when picking up a new codebase.
	refactorSchemaColumnsSQL = "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1"
	refactorSchemaTablesSQL  = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
)

var refactorTables = []string{"users", "orders", "sessions"}

// Refactor models a coding agent that re-fetches the same small set of
// records over and over while iterating on a refactor. ~90% of queries
// are user lookups against an 8-email key universe; ~10% are schema
// introspection.
type Refactor struct {
	rng *rand.Rand
}

// NewRefactor constructs a deterministic refactor generator.
func NewRefactor(cfg Config) *Refactor {
	return &Refactor{rng: newRNG(cfg.Seed)}
}

// Next returns the next query in the stream. Distribution per call:
//   - 90% user lookup, parameterized over the 8-email universe
//   - 5% schema-columns lookup against one of 3 tables
//   - 5% schema-tables list (no params)
func (r *Refactor) Next() (Query, bool) {
	roll := r.rng.IntN(100)
	switch {
	case roll < 90:
		email := refactorEmails[r.rng.IntN(len(refactorEmails))]
		return Query{
			SQL:    refactorUserSQL,
			Params: []any{email},
			Tag:    "user_lookup",
		}, true
	case roll < 95:
		tbl := refactorTables[r.rng.IntN(len(refactorTables))]
		return Query{
			SQL:    refactorSchemaColumnsSQL,
			Params: []any{tbl},
			Tag:    "schema_columns",
		}, true
	default:
		return Query{
			SQL:    refactorSchemaTablesSQL,
			Params: nil,
			Tag:    "schema_tables",
		}, true
	}
}

// newRNG centralizes seed handling so every preset hits the same path.
// math/rand/v2 requires a 16-byte state for ChaCha8; we expand the int64
// seed by repeating it. This is fine for benchmark reproducibility — we
// don't need cryptographic-quality entropy, we need "same int → same
// bytes."
func newRNG(seed int64) *rand.Rand {
	hi := uint64(seed)
	lo := uint64(seed) ^ 0x9E3779B97F4A7C15 // golden ratio constant; just to differentiate halves
	src := rand.NewPCG(hi, lo)
	return rand.New(src)
}
