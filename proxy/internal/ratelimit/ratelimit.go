// Package ratelimit ships v0.1.0c's per-agent token-bucket rate
// limiter for the Postgres proxy.
//
// One bucket exists per (agent_id, pool) key. Buckets refill at a
// configurable per-second rate up to a configurable burst. Acquire
// blocks until a token is available or ctx is canceled. The returned
// pgproxy.Decision distinguishes an immediate permit (DecisionAllowed)
// from one that had to wait for refill (DecisionRateLimited); the
// request still completes in both cases — DecisionRateLimited is a
// back-pressure signal threaded into the audit row, not a rejection.
//
// Agents are mapped to pools through configuration. Without
// configuration, an identified agent (non-empty agent_id) lands in the
// "agents" pool and an unidentified one in "unauth". Production
// traffic (real humans / web tier) is expected to be mapped explicitly
// to the "production" pool via the per-agent overrides table; this
// keeps human-facing traffic insulated from rogue agent traffic.
//
// The implementation lives behind the pgproxy.RateLimiter interface
// declared in proxy/internal/pgproxy/interfaces.go. Server.RateLimiter
// is nil-by-default; vigil-proxy wires this Limiter in when
// --ratelimit-config is supplied (or always, with defaults, if the
// flag is omitted).
package ratelimit

import (
	"context"
	"sync"
	"time"

	"github.com/costaxanthos/vigil/proxy/internal/pgproxy"
)

// Pool names shipped by default. Operators can add more via config,
// but these three are the contract the docs and the dashboard rely
// on.
const (
	PoolProduction = "production"
	PoolAgents     = "agents"
	PoolUnauth     = "unauth"
)

// PoolConfig is the per-pool tunable: how many tokens fit in the
// bucket at once (Burst) and how fast it refills (RefillPerSec, in
// tokens per second).
//
// Burst must be > 0 and RefillPerSec must be >= 0. A zero refill
// rate produces a one-shot bucket — useful in tests where we want to
// deterministically drain N requests and then block.
type PoolConfig struct {
	Burst        float64
	RefillPerSec float64
}

// AgentOverride is a per-agent rule that picks a pool and optionally
// overrides its tunables. Pool selects which named pool to use; Burst
// and RefillPerSec, when non-zero, override the pool's defaults for
// this agent specifically.
//
// A zero-valued override (no Pool, no Burst, no RefillPerSec) is
// equivalent to having no override at all.
type AgentOverride struct {
	Pool         string
	Burst        float64
	RefillPerSec float64
}

// Config is the loaded rate-limit configuration. Pools holds the
// named pool tunables; Agents maps agent_id to a pool selection plus
// optional per-agent tunables.
//
// Config is read once at startup. There is no live reload — operators
// restart vigil-proxy to apply changes.
type Config struct {
	Pools  map[string]PoolConfig
	Agents map[string]AgentOverride
}

// DefaultConfig returns the shipped defaults: three pools with
// values that match the v0.1.0c spec.
//
//	production: burst=1000, refill=500 — real human/web tier
//	agents:     burst=100,  refill=50  — identified agents
//	unauth:     burst=10,   refill=5   — anonymous traffic
func DefaultConfig() Config {
	return Config{
		Pools: map[string]PoolConfig{
			PoolProduction: {Burst: 1000, RefillPerSec: 500},
			PoolAgents:     {Burst: 100, RefillPerSec: 50},
			PoolUnauth:     {Burst: 10, RefillPerSec: 5},
		},
		Agents: map[string]AgentOverride{},
	}
}

// Clock abstracts wall-clock reading so tests can pin time.
// Production code uses RealClock which wraps time.Now and time.After.
type Clock interface {
	Now() time.Time
	// Sleep blocks for d or returns early when ctx is canceled. The
	// returned bool is true iff the sleep completed fully (false on
	// cancel). RealClock implements this via time.NewTimer; test
	// clocks can advance manually.
	Sleep(ctx context.Context, d time.Duration) bool
}

// RealClock is the production Clock — time.Now plus a context-aware
// timer for Sleep. Holds no state; the zero value is usable.
type RealClock struct{}

// Now returns time.Now().
func (RealClock) Now() time.Time { return time.Now() }

// Sleep blocks for d or until ctx is canceled. Returns true on full
// completion, false on cancel. We use a fresh timer per call rather
// than time.After so the underlying timer is GC'd promptly even
// when ctx is canceled before it fires.
func (RealClock) Sleep(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return true
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// bucket holds the state for one (agent_id, pool) pair. The mutex is
// per-bucket so the map (which guards all buckets) can be held under
// a coarser RWMutex with low contention on the read path.
type bucket struct {
	mu           sync.Mutex
	tokens       float64
	lastRefill   time.Time
	burst        float64
	refillPerSec float64
}

// Limiter implements pgproxy.RateLimiter with classic token-bucket
// semantics. Safe for concurrent use; one Limiter is shared across
// every connection.
type Limiter struct {
	cfg   Config
	clock Clock

	mu      sync.RWMutex
	buckets map[bucketKey]*bucket
}

// bucketKey uniquely names a bucket. The pool is part of the key so a
// per-agent override that changes the pool implicitly creates a fresh
// bucket — old state is harmless and gets GC'd when the bucket falls
// out of the map. In v0.1.0c the map only grows; v0.1.0c.1 may add
// idle-eviction. At expected scale (a few hundred agents) the leak is
// inconsequential.
type bucketKey struct {
	agentID string
	pool    string
}

// New constructs a Limiter from the given config. Pools that are
// missing from cfg.Pools fall back to DefaultConfig values when they
// are referenced; this matches the "fail soft on missing pool name"
// contract noted in the spec.
//
// clock may be nil; the zero value of RealClock is used in that case.
func New(cfg Config, clock Clock) *Limiter {
	if clock == nil {
		clock = RealClock{}
	}
	// Defensively normalize: if the caller passed a Config with nil
	// maps, fill them in so we never panic on lookup. The default
	// pools are merged in for any pool the caller didn't supply, so
	// "agents", "unauth", "production" are always resolvable.
	if cfg.Pools == nil {
		cfg.Pools = map[string]PoolConfig{}
	}
	defaults := DefaultConfig()
	for name, pc := range defaults.Pools {
		if _, ok := cfg.Pools[name]; !ok {
			cfg.Pools[name] = pc
		}
	}
	if cfg.Agents == nil {
		cfg.Agents = map[string]AgentOverride{}
	}
	return &Limiter{
		cfg:     cfg,
		clock:   clock,
		buckets: map[bucketKey]*bucket{},
	}
}

// Acquire is the pgproxy.RateLimiter interface entry point. It looks
// up (or creates) the bucket for (agentID, resolvedPool), refills it
// based on elapsed wall time, and either returns immediately with
// DecisionAllowed (a token was available) or waits for one refill
// interval, then loops. The first wait converts the return value to
// DecisionRateLimited so the audit row can distinguish blocked-then-
// admitted traffic from straight-through traffic.
//
// If ctx is canceled while waiting, the call returns
// (DecisionAllowed, ctx.Err()). pgproxy's relay treats that as a
// fatal cancellation of the connection — we surface ctx.Err() rather
// than swallowing it.
//
// route is unused in v0.1.0c (the spec defers per-route weighting to
// v2). Accepted in the signature so call sites don't need to change
// when weighting lands.
func (l *Limiter) Acquire(ctx context.Context, agentID, route string) (pgproxy.Decision, error) {
	_ = route // reserved for v2 per-route weighting

	pool, pc := l.resolve(agentID)
	b := l.getOrCreateBucket(agentID, pool, pc)

	waited := false
	for {
		b.mu.Lock()
		now := l.clock.Now()
		// Refill: clamp at burst so we never accumulate beyond the
		// configured maximum. Elapsed is in seconds (float) to
		// preserve sub-second resolution; integer math here would
		// drop refills that took less than a full second.
		elapsed := now.Sub(b.lastRefill).Seconds()
		if elapsed > 0 && b.refillPerSec > 0 {
			b.tokens += elapsed * b.refillPerSec
			if b.tokens > b.burst {
				b.tokens = b.burst
			}
		}
		b.lastRefill = now

		if b.tokens >= 1 {
			b.tokens--
			b.mu.Unlock()
			if waited {
				return pgproxy.DecisionRateLimited, nil
			}
			return pgproxy.DecisionAllowed, nil
		}

		// Compute how long until one token regenerates. With
		// refillPerSec == 0 this would be +Inf; treat that as "wait
		// until ctx is canceled" by passing a generous duration to
		// Sleep. (The frozen-clock test in #1 relies on this path.)
		var wait time.Duration
		if b.refillPerSec > 0 {
			need := 1 - b.tokens
			seconds := need / b.refillPerSec
			wait = time.Duration(seconds * float64(time.Second))
			if wait <= 0 {
				wait = time.Millisecond // float rounding floor
			}
		} else {
			// Zero refill — only ctx cancellation can release us.
			// Picking a year is fine: Sleep returns early on ctx
			// regardless, and we never actually wait that long.
			wait = 365 * 24 * time.Hour
		}
		b.mu.Unlock()

		waited = true
		if !l.clock.Sleep(ctx, wait) {
			// Sleep returned false → ctx was canceled.
			return pgproxy.DecisionAllowed, ctx.Err()
		}
		// On full sleep completion, loop and try to acquire again.
	}
}

// resolve picks the pool and effective PoolConfig for an agent.
// Resolution order, highest priority first:
//
//  1. Per-agent override with both Burst and RefillPerSec set:
//     return those tunables under the agent's pool name (default
//     "agents"/"unauth" if no Pool override is given).
//  2. Per-agent override naming a pool: return that pool's tunables.
//  3. Default mapping: identified → "agents", anonymous → "unauth".
//
// The returned pool name is the bucket key suffix; the returned
// PoolConfig is what the bucket is constructed/updated with.
func (l *Limiter) resolve(agentID string) (string, PoolConfig) {
	defaultPool := PoolAgents
	if agentID == "" {
		defaultPool = PoolUnauth
	}

	override, hasOverride := l.cfg.Agents[agentID]
	if !hasOverride {
		return defaultPool, l.poolConfig(defaultPool)
	}

	pool := override.Pool
	if pool == "" {
		pool = defaultPool
	}

	base := l.poolConfig(pool)
	if override.Burst > 0 {
		base.Burst = override.Burst
	}
	if override.RefillPerSec > 0 {
		base.RefillPerSec = override.RefillPerSec
	}
	return pool, base
}

// poolConfig returns the named pool's tunables, falling back to the
// "agents" pool if the named pool isn't configured. This is the soft-
// fallback the spec requires when a per-agent override names a pool
// that doesn't exist in this config snapshot.
func (l *Limiter) poolConfig(name string) PoolConfig {
	if pc, ok := l.cfg.Pools[name]; ok {
		return pc
	}
	// Defaults always include "agents"; this lookup can't itself miss
	// because New() merged DefaultConfig into the supplied config.
	return l.cfg.Pools[PoolAgents]
}

// getOrCreateBucket looks up the bucket for (agentID, pool) under a
// read lock first (the common case) and falls through to a write lock
// for the rare create path. The pool's tunables are passed in so we
// don't re-resolve under the write lock.
func (l *Limiter) getOrCreateBucket(agentID, pool string, pc PoolConfig) *bucket {
	key := bucketKey{agentID: agentID, pool: pool}

	l.mu.RLock()
	b, ok := l.buckets[key]
	l.mu.RUnlock()
	if ok {
		return b
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	// Re-check under the write lock — another goroutine may have
	// created it between our RUnlock and Lock.
	if b, ok := l.buckets[key]; ok {
		return b
	}
	b = &bucket{
		tokens:       pc.Burst, // start full
		lastRefill:   l.clock.Now(),
		burst:        pc.Burst,
		refillPerSec: pc.RefillPerSec,
	}
	l.buckets[key] = b
	return b
}

// Compile-time assertion that *Limiter satisfies pgproxy.RateLimiter.
var _ pgproxy.RateLimiter = (*Limiter)(nil)
