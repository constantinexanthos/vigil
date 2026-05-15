package ratelimit

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/costaxanthos/vigil/proxy/internal/pgproxy"
)

// fakeClock is the test-side Clock implementation. It never advances
// on its own; tests call Advance to move time forward. Sleep delivers
// the configured outcome via two channels: by default it blocks until
// the test releases it (mimicking "ctx cancel while waiting"), or the
// test can pre-set autoAdvance to make Sleep behave like real time
// has elapsed.
type fakeClock struct {
	mu          sync.Mutex
	now         time.Time
	sleeps      atomic.Int64 // count of Sleep calls
	sleepCh     chan struct{}
	autoAdvance bool // when true, Sleep advances `now` by d and returns true
}

func newFakeClock(start time.Time) *fakeClock {
	return &fakeClock{
		now:     start,
		sleepCh: make(chan struct{}),
	}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

// Advance moves the clock forward by d. Tests that pin "real time" at
// a particular instant call this between Acquire calls to control
// refill behavior precisely.
func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func (c *fakeClock) setAutoAdvance(v bool) {
	c.mu.Lock()
	c.autoAdvance = v
	c.mu.Unlock()
}

// releaseOneSleep unblocks a single Sleep call and tells it to behave
// as a full completion (returns true). Used in tests that need to
// step through "Acquire waited, then got admitted" deterministically.
func (c *fakeClock) releaseOneSleep() {
	c.sleepCh <- struct{}{}
}

// Sleep is the Clock interface entry point used by Limiter.Acquire.
// Behavior depends on flags set by the test:
//
//   - autoAdvance == true: advance the clock by d and return true.
//     Equivalent to real time passing.
//   - autoAdvance == false: block on sleepCh OR ctx.Done() — the
//     test must call releaseOneSleep to admit the waiter.
func (c *fakeClock) Sleep(ctx context.Context, d time.Duration) bool {
	c.sleeps.Add(1)
	c.mu.Lock()
	auto := c.autoAdvance
	c.mu.Unlock()

	if auto {
		c.mu.Lock()
		c.now = c.now.Add(d)
		c.mu.Unlock()
		return true
	}

	select {
	case <-c.sleepCh:
		return true
	case <-ctx.Done():
		return false
	}
}

// frozenClock is a Clock that never advances. Used by tests where the
// bucket should never refill — pulled out into its own type so we
// don't have to remember to call autoAdvance(false) every time.
type frozenClock struct {
	at time.Time
}

func (c frozenClock) Now() time.Time { return c.at }

func (c frozenClock) Sleep(ctx context.Context, d time.Duration) bool {
	<-ctx.Done()
	return false
}

// ============================================================
// Acceptance test #1: bucket of size N, refill 0, frozen clock.
// First N Acquire calls return DecisionAllowed immediately; the
// (N+1)th blocks until ctx is canceled and returns ctx.Err().
// ============================================================

func TestAcquireDrainsBurstThenBlocksUntilContextCancel(t *testing.T) {
	const burst = 10
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents: {Burst: burst, RefillPerSec: 0},
		},
	}
	clock := frozenClock{at: time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)}
	lim := New(cfg, clock)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for i := 0; i < burst; i++ {
		d, err := lim.Acquire(ctx, "ag_test", "simple_query")
		if err != nil {
			t.Fatalf("Acquire #%d returned error: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("Acquire #%d: want DecisionAllowed, got %v", i, d)
		}
	}

	// The (N+1)th Acquire should block forever (refill==0, frozen
	// clock). We cancel after a short delay and verify the call
	// returned ctx.Err() with DecisionAllowed.
	done := make(chan struct {
		d   pgproxy.Decision
		err error
	}, 1)
	go func() {
		d, err := lim.Acquire(ctx, "ag_test", "simple_query")
		done <- struct {
			d   pgproxy.Decision
			err error
		}{d, err}
	}()

	// Give the goroutine a chance to reach Sleep before we cancel.
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case result := <-done:
		if result.d != pgproxy.DecisionAllowed {
			t.Fatalf("cancelled Acquire: want DecisionAllowed, got %v", result.d)
		}
		if !errors.Is(result.err, context.Canceled) {
			t.Fatalf("cancelled Acquire: want context.Canceled, got %v", result.err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled Acquire did not return within 2s")
	}
}

// ============================================================
// Acceptance test #2: pool isolation. Drain one pool, another
// agent in a different pool is unaffected.
// ============================================================

func TestPoolIsolation(t *testing.T) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents:     {Burst: 3, RefillPerSec: 0},
			PoolProduction: {Burst: 5, RefillPerSec: 0},
		},
		Agents: map[string]AgentOverride{
			"ag_prod": {Pool: PoolProduction},
			// ag_normal stays in default "agents" pool.
		},
	}
	clock := frozenClock{at: time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)}
	lim := New(cfg, clock)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Drain the agents pool for ag_normal.
	for i := 0; i < 3; i++ {
		d, err := lim.Acquire(ctx, "ag_normal", "simple_query")
		if err != nil {
			t.Fatalf("ag_normal Acquire #%d: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("ag_normal Acquire #%d: want allowed, got %v", i, d)
		}
	}

	// ag_prod sits in production — still has full burst available.
	for i := 0; i < 5; i++ {
		d, err := lim.Acquire(ctx, "ag_prod", "simple_query")
		if err != nil {
			t.Fatalf("ag_prod Acquire #%d: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("ag_prod Acquire #%d: want allowed, got %v", i, d)
		}
	}
}

// ============================================================
// Acceptance test #3: anonymous (empty agent_id) clients share the
// unauth pool. One drains it; the other blocks. An identified
// agent in the agents pool is unaffected.
// ============================================================

func TestAnonymousClientsShareUnauthBucket(t *testing.T) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents: {Burst: 5, RefillPerSec: 0},
			PoolUnauth: {Burst: 2, RefillPerSec: 0},
		},
	}
	clock := frozenClock{at: time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)}
	lim := New(cfg, clock)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Two empty-agent-id clients share the unauth bucket — even
	// though they're conceptually separate clients, the bucket key
	// (agentID="", pool="unauth") collapses them. Drain in 2 calls.
	for i := 0; i < 2; i++ {
		d, err := lim.Acquire(ctx, "", "simple_query")
		if err != nil {
			t.Fatalf("anon Acquire #%d: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("anon Acquire #%d: want allowed, got %v", i, d)
		}
	}

	// 3rd anon call must block; verify by cancelling.
	cctx, ccancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() {
		_, err := lim.Acquire(cctx, "", "simple_query")
		done <- err
	}()
	time.Sleep(20 * time.Millisecond)
	ccancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("anon 3rd Acquire: want context.Canceled, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("anon 3rd Acquire did not return within 2s")
	}

	// Identified agent in the agents pool — untouched.
	d, err := lim.Acquire(ctx, "ag_identified", "simple_query")
	if err != nil {
		t.Fatalf("identified Acquire: %v", err)
	}
	if d != pgproxy.DecisionAllowed {
		t.Fatalf("identified Acquire: want allowed, got %v", d)
	}
}

// ============================================================
// Acceptance test #4: config parsing — good fixture parses, bad
// fixture errors. The fixtures live in testdata/.
// ============================================================

func TestLoadConfigGoodAndMalformed(t *testing.T) {
	cfg, err := LoadConfig("testdata/good.yaml")
	if err != nil {
		t.Fatalf("LoadConfig(good): %v", err)
	}
	// Spot-check the merged result. Defaults present plus the two
	// per-agent overrides from the fixture.
	if cfg.Pools[PoolProduction].Burst != 1000 {
		t.Errorf("good.yaml production burst: want 1000, got %v", cfg.Pools[PoolProduction].Burst)
	}
	if cfg.Pools[PoolAgents].RefillPerSec != 500 {
		t.Errorf("good.yaml agents refill: want 500, got %v", cfg.Pools[PoolAgents].RefillPerSec)
	}
	if cfg.Agents["ag_promote_to_prod"].Pool != PoolProduction {
		t.Errorf("good.yaml ag_promote_to_prod: want pool=production, got %q", cfg.Agents["ag_promote_to_prod"].Pool)
	}
	if cfg.Agents["ag_heavy_hitter"].Burst != 200 {
		t.Errorf("good.yaml ag_heavy_hitter burst: want 200, got %v", cfg.Agents["ag_heavy_hitter"].Burst)
	}

	if _, err := LoadConfig("testdata/malformed.yaml"); err == nil {
		t.Fatal("LoadConfig(malformed): want error, got nil")
	}

	// Pool-override fixture: only "agents" is specified; the other
	// two pools should keep their defaults.
	cfg2, err := LoadConfig("testdata/pool-override.yaml")
	if err != nil {
		t.Fatalf("LoadConfig(pool-override): %v", err)
	}
	if cfg2.Pools[PoolAgents].Burst != 50 {
		t.Errorf("pool-override agents burst: want 50, got %v", cfg2.Pools[PoolAgents].Burst)
	}
	if cfg2.Pools[PoolProduction].Burst != 1000 {
		t.Errorf("pool-override production burst: want default 1000, got %v", cfg2.Pools[PoolProduction].Burst)
	}
	if cfg2.Pools[PoolUnauth].Burst != 10 {
		t.Errorf("pool-override unauth burst: want default 10, got %v", cfg2.Pools[PoolUnauth].Burst)
	}

	// Missing file is an error, not a silent default.
	if _, err := LoadConfig("testdata/does-not-exist.yaml"); err == nil {
		t.Fatal("LoadConfig(missing): want error, got nil")
	}

	// Empty path is an error.
	if _, err := LoadConfig(""); err == nil {
		t.Fatal("LoadConfig(empty): want error, got nil")
	}
}

// ============================================================
// Acceptance test #5: decision values. Immediate permit returns
// DecisionAllowed; permit-after-wait returns DecisionRateLimited.
// Determinism via injected clock.
// ============================================================

func TestAcquireReturnsRateLimitedAfterWait(t *testing.T) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			// Burst 1 so the first Acquire drains the bucket;
			// the second has to wait. Refill 10/s so the wait
			// computation is exact at 100ms per token.
			PoolAgents: {Burst: 1, RefillPerSec: 10},
		},
	}
	clock := newFakeClock(time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC))
	clock.setAutoAdvance(true)
	lim := New(cfg, clock)

	ctx := context.Background()

	// First call: bucket starts full (1 token), immediate permit.
	d1, err := lim.Acquire(ctx, "ag_test", "simple_query")
	if err != nil {
		t.Fatalf("Acquire #1: %v", err)
	}
	if d1 != pgproxy.DecisionAllowed {
		t.Errorf("Acquire #1: want DecisionAllowed, got %v", d1)
	}

	// Second call: bucket is empty; with autoAdvance the fake
	// clock simulates wall-clock progress equal to the computed
	// sleep duration. Limiter loops back, refills, and admits.
	d2, err := lim.Acquire(ctx, "ag_test", "simple_query")
	if err != nil {
		t.Fatalf("Acquire #2: %v", err)
	}
	if d2 != pgproxy.DecisionRateLimited {
		t.Errorf("Acquire #2: want DecisionRateLimited, got %v", d2)
	}
	if clock.sleeps.Load() != 1 {
		t.Errorf("Acquire #2: want exactly 1 Sleep call, got %d", clock.sleeps.Load())
	}
}

// TestAcquireImmediatePermitReturnsAllowed independently confirms the
// happy path so a regression in the "waited" flag tracking can't be
// masked by acceptance #1 (which only exercises the cancel path).
func TestAcquireImmediatePermitReturnsAllowed(t *testing.T) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents: {Burst: 5, RefillPerSec: 1},
		},
	}
	clock := frozenClock{at: time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)}
	lim := New(cfg, clock)

	ctx := context.Background()
	for i := 0; i < 5; i++ {
		d, err := lim.Acquire(ctx, "ag_x", "simple_query")
		if err != nil {
			t.Fatalf("Acquire #%d: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("Acquire #%d: want DecisionAllowed, got %v", i, d)
		}
	}
}

// TestRefillCapsAtBurst verifies the refill formula honors the burst
// ceiling. A long idle period must not let the bucket accumulate
// beyond Burst tokens — that would invalidate the back-pressure
// guarantee.
func TestRefillCapsAtBurst(t *testing.T) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents: {Burst: 3, RefillPerSec: 100},
		},
	}
	clock := newFakeClock(time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC))
	lim := New(cfg, clock)

	ctx := context.Background()

	// Drain.
	for i := 0; i < 3; i++ {
		if _, err := lim.Acquire(ctx, "ag_x", "simple_query"); err != nil {
			t.Fatalf("drain #%d: %v", i, err)
		}
	}

	// Advance "forever". Even though math says we'd accumulate
	// 36000 tokens, the bucket must clamp to Burst==3.
	clock.Advance(6 * time.Minute)

	// Now four consecutive Acquire calls: the first three should be
	// immediate (cap held at 3), the fourth must wait. With
	// autoAdvance off, the fourth call would block forever on the
	// fakeClock; cancel it and assert.
	for i := 0; i < 3; i++ {
		d, err := lim.Acquire(ctx, "ag_x", "simple_query")
		if err != nil {
			t.Fatalf("post-refill Acquire #%d: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("post-refill Acquire #%d: want allowed, got %v", i, d)
		}
	}

	cctx, ccancel := context.WithCancel(ctx)
	done := make(chan pgproxy.Decision, 1)
	errs := make(chan error, 1)
	go func() {
		d, err := lim.Acquire(cctx, "ag_x", "simple_query")
		done <- d
		errs <- err
	}()
	time.Sleep(20 * time.Millisecond)
	ccancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("4th post-refill Acquire did not return after cancel")
	}
}

// TestPerAgentBurstOverride verifies an explicit burst/refill on the
// agent override beats the pool default.
func TestPerAgentBurstOverride(t *testing.T) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents: {Burst: 1, RefillPerSec: 0},
		},
		Agents: map[string]AgentOverride{
			"ag_special": {Burst: 5, RefillPerSec: 0},
		},
	}
	clock := frozenClock{at: time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)}
	lim := New(cfg, clock)

	ctx := context.Background()

	// The plain "agents" pool gets only 1 token.
	if _, err := lim.Acquire(ctx, "ag_other", "simple_query"); err != nil {
		t.Fatalf("ag_other #1: %v", err)
	}

	// ag_special inherits its own burst=5.
	for i := 0; i < 5; i++ {
		d, err := lim.Acquire(ctx, "ag_special", "simple_query")
		if err != nil {
			t.Fatalf("ag_special #%d: %v", i, err)
		}
		if d != pgproxy.DecisionAllowed {
			t.Fatalf("ag_special #%d: want allowed, got %v", i, d)
		}
	}
}

// TestDefaultConfigShape pins the shipped defaults so a future refactor
// can't change them silently. The numbers here are the ones quoted in
// proxy/README.md's rate-limit table and on bevigil.ai's docs — they're
// effectively a public contract.
func TestDefaultConfigShape(t *testing.T) {
	cfg := DefaultConfig()

	for _, tc := range []struct {
		pool   string
		burst  float64
		refill float64
	}{
		{PoolProduction, 1000, 500},
		{PoolAgents, 1000, 500},
		{PoolUnauth, 10, 5},
	} {
		pc, ok := cfg.Pools[tc.pool]
		if !ok {
			t.Errorf("DefaultConfig missing pool %q", tc.pool)
			continue
		}
		if pc.Burst != tc.burst {
			t.Errorf("DefaultConfig %s burst: want %v, got %v", tc.pool, tc.burst, pc.Burst)
		}
		if pc.RefillPerSec != tc.refill {
			t.Errorf("DefaultConfig %s refill: want %v, got %v", tc.pool, tc.refill, pc.RefillPerSec)
		}
	}
}
