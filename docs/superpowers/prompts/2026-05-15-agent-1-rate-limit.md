# Conductor Prompt — Agent 1: rate limiting (v0.1.0c)

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to ship per-agent token-bucket rate limiting (v0.1.0c) by implementing the `RateLimiter` interface that the lead agent has already wired into the proxy's message pump.

**Two other agents are working in parallel.** Agent 2 is building fan-out coalescing (independent package, separate hook). Agent 3 is polishing the Tauri Proxy tab to surface your numbers. Your work has zero file overlap with either.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-three-agent-push-v01c-v01d-design.md` — this push's spec. Read your stream section in full.
2. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec.
3. `proxy/internal/pgproxy/postgres.go` — pay attention to the `RateLimiter` interface declared in the prep step, and the call site in `relay()` where `Acquire()` is invoked.
4. `proxy/internal/audit/audit.go` — the audit `decision` column is new; understand how `Append` records it.
5. The website's "concrete scenario" copy on `bevigil.ai` — this is the workload shape your limiter needs to handle without disturbing production traffic.

## What you ship

Implement `RateLimiter`:
```go
type RateLimiter interface {
    Acquire(ctx context.Context, agentID, route string) error
}
```

A token-bucket per (agent_id, pool) keyed map. The bucket refills at a configurable rate. `Acquire` blocks (up to `ctx.Done()`) until a token is available, returns nil on permit. Returns an error only for permanently-rejected agents (out of scope for v1 — return nil unless context is cancelled).

## Pools and defaults (the design that matters)

Three pools shipped by default. Agents are mapped to pools by config; without config, an identified agent goes to `agents` and an unidentified one to `unauth`.

| Pool | Burst | Refill (tokens/sec) | Purpose |
|---|---|---|---|
| `production` | 1000 | 500 | Real human/web traffic. Insulated from agent traffic. |
| `agents` | 100 | 50 | Identified agents. Generous for normal work, will throttle abuse. |
| `unauth` | 10 | 5 | Anonymous traffic. Defense against rogue clients. |

These are baked-in defaults. The `--ratelimit-config <path>` flag accepts a YAML file overriding any of them and adding per-agent overrides:

```yaml
pools:
  production: { burst: 1000, refill: 500 }
  agents: { burst: 100, refill: 50 }
  unauth: { burst: 10, refill: 5 }

agents:
  ag_3J9XX: { pool: production }      # explicitly bump an agent to production
  ag_AB2YY: { burst: 200, refill: 100 } # custom bucket inline
```

If `--ratelimit-config` is absent, defaults apply. If it's set but the file is malformed, **fail loud at startup** — don't silently default. Agents need predictable rate limits in production.

## Algorithm

Classic token bucket. For each `(agentID, pool)`:
- `tokens float64`
- `lastRefill time.Time`
- `burst, refillPerSec float64`

On `Acquire`:
1. Lock the bucket.
2. Refill: `tokens = min(burst, tokens + (now - lastRefill).Seconds() * refillPerSec)`.
3. If `tokens >= 1`: decrement, unlock, return nil.
4. Else: compute `wait = (1 - tokens) / refillPerSec`. Unlock. Sleep with `select { case <-time.After(wait): case <-ctx.Done(): return ctx.Err() }`. Loop back.

Use `sync.Mutex` per bucket — coarse granularity is fine at this scale. If profiling shows contention later, switch to a sharded map or `atomic.Uint64` for tokens. Don't pre-optimize.

## Files you own

- `proxy/internal/ratelimit/` — new package:
  - `ratelimit.go` — public `Limiter` type implementing `pgproxy.RateLimiter`, plus the bucket struct.
  - `config.go` — YAML config loading (use `gopkg.in/yaml.v3`; if it's not in go.mod yet, add it).
  - `testdata/` — fixture configs for tests (good config, malformed config, pool override config).
  - `*_test.go` — your tests.
- `proxy/cmd/vigil-proxy/main.go` — additive: parse `--ratelimit-config` flag, instantiate `ratelimit.New(cfg)`, assign to `Server.RateLimiter`.
- `proxy/go.mod` / `proxy/go.sum` — additive: add yaml.v3 if needed.

## Files you MUST NOT touch

- `proxy/internal/pgproxy/` — interfaces are stable from prep PR. Just consume them.
- `proxy/internal/coalesce/` — Agent 2's territory.
- `proxy/internal/audit/` — read-only.
- `proxy/internal/identity/` — read-only.
- `app/`, `daemon/`, `site/` — out of scope.

## How the audit decision works

When you block a message (Acquire takes >0 wait), the message still goes through eventually. The audit row is written by pgproxy after Acquire returns. **You don't write to audit directly.** pgproxy passes a "decision" string into `audit.Writer.Append`. Your job: when you decide to block, signal "rate_limited" via the return value of Acquire.

The interface change in prep is:
```go
type Decision string

const (
    DecisionAllowed     Decision = "allowed"
    DecisionRateLimited Decision = "rate_limited"
    DecisionCoalesced   Decision = "coalesced"
)

type RateLimiter interface {
    Acquire(ctx context.Context, agentID, route string) (Decision, error)
}
```

If the request flowed through immediately: return `DecisionAllowed`. If it waited (i.e., bucket was empty and you blocked): return `DecisionRateLimited`. The pgproxy call site uses this to set the audit row's decision column.

**Important:** `DecisionRateLimited` does NOT mean rejected. The request still completes. It just spent time in the bucket waiting. This matters for the website's claim — agents aren't rejected, they're paced.

## Acceptance criteria (all must pass in CI before opening the PR)

1. **Behavior unit test.** Bucket of size 10, refill 0/sec (frozen). Acquire 10 times → all immediate. 11th → blocks until ctx.Done() and returns ctx.Err().
2. **Pool isolation test.** Two agents, one in `agents`, one in `production`. Drain `agents` pool. `production` agent's Acquire still returns immediately.
3. **Anonymous bucket test.** Two clients with `agentID=""` share the `unauth` pool. One drains it; the other's Acquire blocks. An identified agent in `agents` pool is unaffected.
4. **Config parsing test.** `testdata/good.yaml` parses, `testdata/malformed.yaml` returns an error from `LoadConfig`.
5. **Decision values.** Acquire that didn't wait returns `DecisionAllowed`. Acquire that waited returns `DecisionRateLimited`. (Use a frozen clock injected into Limiter for determinism.)
6. **Bench non-interference.** `go test -run BenchHarnessIntegration -tags integration` (you can add this — bench harness driven via `proxy/bench/cmd/vigil-bench` against a proxy with default rate limits) completes without contention. The default `production` pool of 1000 burst handles everything the bench throws.

## Out of scope (do not implement)

- Reject-on-overlimit (v2). v1 always blocks, never rejects.
- Per-route weighting (v2). v1 same bucket for all routes.
- Distributed rate limiting across proxy instances. v1 is single-binary.
- Sliding windows, leaky buckets, GCRA. Token bucket is sufficient and well-understood.
- Live config reload. v1 reads at startup only.

## How to know you are done

- All 6 acceptance tests pass in CI.
- `--ratelimit-config` flag works end-to-end with a real YAML file.
- README updated to mention v0.1.0c rate limiting.
- PR opens against `main`, references the push spec, and the v0.1.0c roadmap entry from `2026-05-04-vigil-data-plane-design.md`.

## When you finish

Open a PR, request review from the lead agent. Do not merge yourself. The lead will:
- Review the bucket math for correctness (especially the wait calculation).
- Verify the config loader fails loud on bad input.
- Confirm Agent 2 can rebase cleanly on top.

## When you get stuck

The most likely stuck point is config schema design. If you find yourself adding more than 5 top-level YAML keys, you're probably over-engineering. Stop and ship the minimal three-pool model. Per-agent overrides are useful but optional for v1; if they slow you down, defer to v0.1.0c.1.
