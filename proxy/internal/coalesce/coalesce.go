package coalesce

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// Default settings — match the values stated in the v0.1.0d spec.
const (
	DefaultTTL              = 250 * time.Millisecond
	DefaultPerAgentEntries  = 1000
	DefaultMaxResponseBytes = 256 * 1024 // 256KB — past this, the cache becomes a memory leak.
)

// CacheKey is the lookup key. Same shape as the pgproxy.Coalescer
// interface will declare once prep lands. Defined here for now so the
// package is self-contained and unit-testable.
//
// Params carries bind parameter values for the extended-protocol path.
// Format codes (text vs binary) MUST be folded into the param bytes by
// the caller — different format codes for the same logical value
// produce different upstream responses and therefore must be different
// keys. The simplest fold: prefix each param's bytes with a single
// 0/1 byte indicating format code.
type CacheKey struct {
	QueryText string
	Params    [][]byte
	Database  string
	User      string
}

// Options configures a Cache. Zero values fall back to defaults.
type Options struct {
	TTL              time.Duration // default DefaultTTL
	PerAgentEntries  int           // default DefaultPerAgentEntries
	MaxResponseBytes int           // default DefaultMaxResponseBytes
}

// Cache is the per-agent query response cache. Satisfies the contract
// that will become pgproxy.Coalescer once the prep PR lands.
//
// Implementation: agentID → bounded LRU. The map is protected by a
// sync.RWMutex; entry mutation inside an agent's LRU is protected by
// that LRU's own mutex. This nested locking keeps the hot Lookup path
// short — readers only hold the outer RLock long enough to fetch the
// per-agent LRU pointer.
type Cache struct {
	ttl          time.Duration
	perAgentCap  int
	maxRespBytes int

	mu     sync.RWMutex
	agents map[string]*agentCache
}

type agentCache struct {
	mu  sync.Mutex
	lru *lru
}

// New builds a Cache with the given options. Zero fields fall back to
// the documented defaults.
func New(opts Options) *Cache {
	if opts.TTL <= 0 {
		opts.TTL = DefaultTTL
	}
	if opts.PerAgentEntries <= 0 {
		opts.PerAgentEntries = DefaultPerAgentEntries
	}
	if opts.MaxResponseBytes <= 0 {
		opts.MaxResponseBytes = DefaultMaxResponseBytes
	}
	return &Cache{
		ttl:          opts.TTL,
		perAgentCap:  opts.PerAgentEntries,
		maxRespBytes: opts.MaxResponseBytes,
		agents:       make(map[string]*agentCache),
	}
}

// Lookup checks the cache. Returns the cached response bytes and true
// on hit, or nil/false on miss. Misses also occur for:
//   - anonymous agent (agentID == "")
//   - expired entries (TTL exceeded since Store)
//   - keys that were rejected by the deny list at Store time (those
//     entries never made it in)
func (c *Cache) Lookup(agentID string, key CacheKey) ([]byte, bool) {
	if agentID == "" {
		// Anonymous traffic NEVER coalesces — no safe shared cache key.
		return nil, false
	}
	c.mu.RLock()
	ac, ok := c.agents[agentID]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	ac.mu.Lock()
	v, ok := ac.lru.Get(hashKey(key), time.Now())
	ac.mu.Unlock()
	if !ok {
		return nil, false
	}
	return v, true
}

// Store records a server response under the given key. Silently no-ops
// in any of these cases (the integration code doesn't have to gate):
//   - anonymous agent (agentID == "")
//   - response larger than MaxResponseBytes
//   - query not a coalescable SELECT/WITH
//   - query matches the deny list
//
// The TTL is applied at Store time; the entry expires `TTL` after this
// call regardless of how often it's looked up.
func (c *Cache) Store(agentID string, key CacheKey, response []byte) {
	if agentID == "" {
		return
	}
	if len(response) > c.maxRespBytes {
		return
	}
	normalized := NormalizeQuery(key.QueryText)
	if !IsCoalescableStatement(normalized) {
		return
	}
	if ok, _ := AllowedByDenyList(normalized); !ok {
		return
	}

	// Normalize the key for storage too, so Lookup's normalization
	// matches what's actually keyed.
	key.QueryText = normalized

	c.mu.Lock()
	ac, ok := c.agents[agentID]
	if !ok {
		ac = &agentCache{lru: newLRU(c.perAgentCap)}
		c.agents[agentID] = ac
	}
	c.mu.Unlock()

	ac.mu.Lock()
	ac.lru.Set(hashKey(key), response, time.Now().Add(c.ttl))
	ac.mu.Unlock()
}

// hashKey reduces a CacheKey to a stable string identifier. We use
// SHA-256 over a deterministic byte concatenation: query text || NUL ||
// database || NUL || user || NUL || param0 || NUL || param1 || ...
// Using NUL separators prevents collisions between e.g. (Database="ab",
// User="c") and (Database="a", User="bc").
//
// Hashing instead of using the structured key directly: maps in Go
// can't use slice fields as keys, and a comparable-only struct would
// force callers to pre-canonicalize Params (lossy). The hash collapses
// it to a single string at the cost of one SHA-256 per Lookup, which
// is well below network RTT.
func hashKey(k CacheKey) string {
	// Normalize query text before hashing so two callers that pass
	// "SELECT 1" and "SELECT  1" land on the same hash. The Store path
	// also normalizes, which is the contract; here we do it for the
	// Lookup side too.
	q := NormalizeQuery(k.QueryText)

	h := sha256.New()
	h.Write([]byte(q))
	h.Write([]byte{0})
	h.Write([]byte(k.Database))
	h.Write([]byte{0})
	h.Write([]byte(k.User))
	for _, p := range k.Params {
		h.Write([]byte{0})
		h.Write(p)
	}
	return hex.EncodeToString(h.Sum(nil))
}
