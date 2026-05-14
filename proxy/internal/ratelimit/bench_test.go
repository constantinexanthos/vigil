package ratelimit

import (
	"context"
	"testing"
)

// BenchmarkAcquireWarmBucket measures the steady-state Acquire cost
// when the bucket is warm and tokens are plentiful. This is the only
// path that runs inline on the pump goroutine for every forwarded
// frame, so it must stay well under any latency budget.
//
// Acceptance #6: sub-microsecond per op. On a 2024 M-series Mac this
// benchmark runs around 50-150 ns/op with one mutex acquire and one
// floating-point refill; on slower hardware it stays sub-microsecond.
func BenchmarkAcquireWarmBucket(b *testing.B) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			// High refill so the bucket never drains; we want to
			// measure the no-wait path, not the wait path.
			PoolAgents: {Burst: 1e9, RefillPerSec: 1e9},
		},
	}
	lim := New(cfg, RealClock{})
	ctx := context.Background()

	// Warm up: create the bucket so the get-or-create path runs
	// under the read lock for every iteration.
	if _, err := lim.Acquire(ctx, "ag_bench", "simple_query"); err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = lim.Acquire(ctx, "ag_bench", "simple_query")
	}
}

// BenchmarkAcquireContended measures Acquire under concurrent
// contention from N goroutines on the same bucket. Quantifies the
// per-bucket mutex contention; should still be in the low-microsecond
// range per op even with 100 concurrent callers.
func BenchmarkAcquireContended(b *testing.B) {
	cfg := Config{
		Pools: map[string]PoolConfig{
			PoolAgents: {Burst: 1e9, RefillPerSec: 1e9},
		},
	}
	lim := New(cfg, RealClock{})
	ctx := context.Background()

	if _, err := lim.Acquire(ctx, "ag_bench_contended", "simple_query"); err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = lim.Acquire(ctx, "ag_bench_contended", "simple_query")
		}
	})
}
