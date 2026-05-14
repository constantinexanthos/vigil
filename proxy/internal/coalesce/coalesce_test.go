package coalesce

import (
	"math/rand/v2"
	"strconv"
	"testing"
	"time"
)

// The Cache is the type pgproxy.Coalescer is implemented by. The
// integration is one wire in main.go (`pgSrv.Coalescer = cache`) once
// the lead's prep PR lands. Everything else is in this package.

func newTestCache() *Cache {
	return New(Options{TTL: 250 * time.Millisecond, PerAgentEntries: 1000})
}

// Hit/miss round trip — the table-stakes contract. Lookup before Store
// returns miss; Store followed by Lookup returns hit with the same bytes.
func TestCacheLookupAfterStoreHits(t *testing.T) {
	c := newTestCache()
	key := CacheKey{QueryText: "SELECT 1"}

	if _, ok := c.Lookup("agent-1", key); ok {
		t.Errorf("Lookup before Store: expected miss")
	}
	c.Store("agent-1", key, []byte("ok"))
	got, ok := c.Lookup("agent-1", key)
	if !ok || string(got) != "ok" {
		t.Errorf("after Store: got (%q, %v), want (%q, true)", got, ok, "ok")
	}
}

// Per-agent isolation. Agent A's cache MUST NOT be served to agent B.
// Different agents see different DB roles / search_paths / RLS context;
// cross-agent serving would return wrong rows.
func TestCachePerAgentIsolation(t *testing.T) {
	c := newTestCache()
	key := CacheKey{QueryText: "SELECT 1"}
	c.Store("agent-A", key, []byte("A-response"))

	if _, ok := c.Lookup("agent-B", key); ok {
		t.Errorf("agent-B got agent-A's cached entry; isolation broken")
	}

	got, ok := c.Lookup("agent-A", key)
	if !ok || string(got) != "A-response" {
		t.Errorf("agent-A's own entry: got (%q, %v)", got, ok)
	}
}

// Anonymous agent (empty agentID) MUST NOT coalesce — there's no safe
// shared key. The Cache silently refuses both Lookup and Store for
// agentID="" to keep the integration simple (caller doesn't have to
// remember to gate).
func TestCacheAnonymousAgentNeverCoalesces(t *testing.T) {
	c := newTestCache()
	key := CacheKey{QueryText: "SELECT 1"}

	c.Store("", key, []byte("response"))
	if _, ok := c.Lookup("", key); ok {
		t.Errorf("anonymous agentID coalesced; should always miss")
	}
}

// Cache key includes Database and User and the bind Params. Same
// QueryText with different params → different cache entries.
func TestCacheKeyIncludesBindParameters(t *testing.T) {
	c := newTestCache()
	a := CacheKey{QueryText: "SELECT * FROM users WHERE id = $1", Params: [][]byte{[]byte("1")}}
	b := CacheKey{QueryText: "SELECT * FROM users WHERE id = $1", Params: [][]byte{[]byte("2")}}

	c.Store("agent-1", a, []byte("user-1"))
	if _, ok := c.Lookup("agent-1", b); ok {
		t.Errorf("different params returned same cache entry")
	}
}

func TestCacheKeyIncludesDatabaseAndUser(t *testing.T) {
	c := newTestCache()
	base := CacheKey{QueryText: "SELECT 1", Database: "prod", User: "admin"}
	other := CacheKey{QueryText: "SELECT 1", Database: "staging", User: "admin"}
	otherUser := CacheKey{QueryText: "SELECT 1", Database: "prod", User: "readonly"}

	c.Store("a", base, []byte("base"))
	if _, ok := c.Lookup("a", other); ok {
		t.Errorf("different database returned same entry")
	}
	if _, ok := c.Lookup("a", otherUser); ok {
		t.Errorf("different user returned same entry")
	}
}

// TTL: stored at t=0 with 250ms TTL, hit at 100ms, miss at 500ms.
func TestCacheTTLExpires(t *testing.T) {
	c := New(Options{TTL: 50 * time.Millisecond, PerAgentEntries: 10})
	key := CacheKey{QueryText: "SELECT 1"}
	c.Store("agent-1", key, []byte("v"))

	// Immediate Lookup hits.
	if _, ok := c.Lookup("agent-1", key); !ok {
		t.Errorf("immediate Lookup: expected hit")
	}

	// Wait > TTL → miss.
	time.Sleep(100 * time.Millisecond)
	if _, ok := c.Lookup("agent-1", key); ok {
		t.Errorf("after TTL: expected miss")
	}
}

// Deny-list integration: queries on the deny list never cache even if
// Store is called. The Cache itself enforces this — callers can't
// "force" a coalesce by going around the normalization layer.
func TestCacheStoreRefusesDeniedQueries(t *testing.T) {
	c := newTestCache()
	key := CacheKey{QueryText: "SELECT nextval('s')"}
	c.Store("agent-1", key, []byte("999"))
	if _, ok := c.Lookup("agent-1", key); ok {
		t.Errorf("nextval() got stored; deny-list bypassed")
	}
}

// Non-SELECT statements never cache.
func TestCacheStoreRefusesNonSelects(t *testing.T) {
	c := newTestCache()
	key := CacheKey{QueryText: "INSERT INTO t VALUES (1)"}
	c.Store("agent-1", key, []byte("ok"))
	if _, ok := c.Lookup("agent-1", key); ok {
		t.Errorf("INSERT got stored")
	}
}

// Response size cap. Per spec: don't cache responses >256KB. Larger
// responses are silently dropped on Store.
func TestCacheDropsOversizedResponses(t *testing.T) {
	c := New(Options{TTL: time.Hour, PerAgentEntries: 10, MaxResponseBytes: 1024})
	key := CacheKey{QueryText: "SELECT * FROM bigtable"}
	c.Store("agent-1", key, make([]byte, 1025)) // 1 byte over
	if _, ok := c.Lookup("agent-1", key); ok {
		t.Errorf("oversize response was cached; size cap broken")
	}
	// Within the cap: still works.
	c.Store("agent-1", key, make([]byte, 1024))
	if _, ok := c.Lookup("agent-1", key); !ok {
		t.Errorf("at-cap response was not cached")
	}
}

// Normalization: identical queries with different whitespace produce
// the same cache key.
func TestCacheNormalizesWhitespaceOnKey(t *testing.T) {
	c := newTestCache()
	a := CacheKey{QueryText: "SELECT 1"}
	b := CacheKey{QueryText: "  SELECT  1  "}
	c.Store("agent-1", a, []byte("ok"))
	if _, ok := c.Lookup("agent-1", b); !ok {
		t.Errorf("whitespace-different but semantically identical query missed cache")
	}
}

// Per-agent LRU bound. After (bound+1) distinct queries for ONE agent,
// the oldest one is evicted.
func TestCachePerAgentLRUEviction(t *testing.T) {
	c := New(Options{TTL: time.Hour, PerAgentEntries: 3})
	for i := 0; i < 3; i++ {
		k := CacheKey{QueryText: "SELECT " + strconv.Itoa(i)}
		c.Store("a", k, []byte("v"))
	}
	c.Store("a", CacheKey{QueryText: "SELECT 3"}, []byte("v"))

	if _, ok := c.Lookup("a", CacheKey{QueryText: "SELECT 0"}); ok {
		t.Errorf("first query should be evicted")
	}
	for _, q := range []string{"SELECT 1", "SELECT 2", "SELECT 3"} {
		if _, ok := c.Lookup("a", CacheKey{QueryText: q}); !ok {
			t.Errorf("expected %q present after eviction of LRU", q)
		}
	}
}

// THE bench bar (proxy-free version). Drive the cache with a query
// stream shaped exactly like the bench's `refactor` preset:
//   - 90% user lookups against an 8-email key universe
//   - 5% schema-columns lookup against 3 tables
//   - 5% schema-tables lookup
//
// We replicate the distribution locally rather than importing the
// proxy/bench package — its `internal/` placement blocks cross-tree
// imports. The shape is what matters for the cache property.
//
// Acceptance: ≥40% Lookup hits over 20k queries. This is bench gate #1.
// Can't be measured end-to-end yet because the pgproxy.Coalescer wiring
// is part of a prep PR that hasn't landed on main. The package-level
// test proves the cache mechanism can meet the bar; integration adds it.
func TestCacheHitRateOnRefactorShapedWorkloadMeetsBenchBar(t *testing.T) {
	c := New(Options{TTL: time.Hour, PerAgentEntries: 1000})
	gen := newRefactorShapedGen(42)

	const total = 20_000
	const agentID = "claude-code"

	hits := 0
	for i := 0; i < total; i++ {
		key := gen.Next()
		if _, hit := c.Lookup(agentID, key); hit {
			hits++
			continue
		}
		// Miss path: synthesize a small "response" (the actual pgproxy
		// integration will pass real upstream bytes here). 64 bytes
		// stays well under any size cap.
		c.Store(agentID, key, make([]byte, 64))
	}

	hitRate := float64(hits) / float64(total)
	const bar = 0.40
	if hitRate < bar {
		t.Errorf("refactor-shaped hit rate = %.2f%% (want >= %.0f%%)",
			hitRate*100, bar*100)
	}
	t.Logf("refactor-shaped over %d queries: %d hits (%.2f%%)",
		total, hits, hitRate*100)
}

// refactorShapedGen mirrors proxy/bench/internal/workload/refactor.go's
// distribution. Shape only — actual bench's exact SQL strings don't
// matter for the cache-key property.
type refactorShapedGen struct {
	rng *rand.Rand
}

func newRefactorShapedGen(seed int64) *refactorShapedGen {
	src := rand.NewPCG(uint64(seed), uint64(seed)^0x9E3779B97F4A7C15)
	return &refactorShapedGen{rng: rand.New(src)}
}

var refactorEmails = []string{
	"alice@example.com", "bob@example.com", "carol@example.com",
	"dave@example.com", "eve@example.com", "frank@example.com",
	"grace@example.com", "heidi@example.com",
}
var refactorTables = []string{"users", "orders", "sessions"}

func (g *refactorShapedGen) Next() CacheKey {
	roll := g.rng.IntN(100)
	switch {
	case roll < 90:
		return CacheKey{
			QueryText: "SELECT id, email, created_at FROM users WHERE email = $1",
			Params:    [][]byte{[]byte(refactorEmails[g.rng.IntN(len(refactorEmails))])},
		}
	case roll < 95:
		return CacheKey{
			QueryText: "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
			Params:    [][]byte{[]byte(refactorTables[g.rng.IntN(len(refactorTables))])},
		}
	default:
		return CacheKey{
			QueryText: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
		}
	}
}
