# Conductor Prompt — Agent 2: fan-out coalescing (v0.1.0d)

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to ship the headline feature — fan-out coalescing — by implementing the `Coalescer` interface that the lead agent has wired into the proxy's message pump.

**This is the venture-grade feature.** The website promises "40–80% cost reduction from coalescing." Your acceptance bar is unambiguous: **the existing bench harness must report ≥40% dedup rate on the `refactor` preset.** That number lands on the homepage.

**Two other agents are working in parallel.** Agent 1 is building per-agent rate limiting (independent package, separate hook). Agent 3 is polishing the Tauri Proxy tab to surface your numbers. Your work has zero file overlap with either.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-three-agent-push-v01c-v01d-design.md` — this push's spec. Read your stream section, including all design constraints, in full.
2. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec.
3. `proxy/internal/pgproxy/postgres.go` — the `Coalescer` interface from prep, and the call site in `relay()`. Understand how the response capture is wired.
4. `proxy/bench/internal/workload/refactor.go` — the workload shape your cache needs to dedupe.
5. The website's "concrete scenario" — Agent A fires `SELECT * FROM users WHERE email = ?` 200 times in 30 seconds. **That's exactly the pattern your cache exists to catch.**

## What you ship

Implement `Coalescer`:
```go
type Coalescer interface {
    Lookup(agentID string, key CacheKey) (response []byte, hit bool)
    Store(agentID string, key CacheKey, response []byte)
}
```

An in-memory per-agent query cache with a 250ms default TTL. On Lookup hit, the proxy synthesizes the cached upstream response back to the client without forwarding to upstream. On miss, the proxy forwards normally and captures the response bytes for Store.

## Design constraints — these are non-negotiable

These constraints exist because getting them wrong corrupts user data. Do not bend them.

### 1. Per-agent only

Different agents have different RLS context, search_paths, role memberships → results are NOT interchangeable. **Never** serve agent A's cache to agent B. Anonymous traffic (no agent_id) does NOT coalesce — there's no safe shared cache key.

### 2. Cache key

```go
type CacheKey struct {
    QueryText string   // canonicalized query text
    Params    [][]byte // bind parameters (extended protocol Parse/Bind)
    Database  string   // logical db from startup
    User      string   // role from startup
}
```

Normalization rules for `QueryText`:
- Trim leading/trailing whitespace.
- Collapse internal whitespace runs to a single space.
- Strip trailing semicolons.
- **Do NOT lowercase.** Postgres treats quoted identifiers case-sensitively (`"User"` ≠ `"user"`).
- **Do NOT strip comments.** A comment can change query plan via planner hints.

### 3. Transaction safety — DO NOT COALESCE INSIDE A BEGIN

Track per-connection transaction state. The proxy needs a per-connection counter that increments on `BEGIN`/`START TRANSACTION` and decrements on `COMMIT`/`ROLLBACK`. The Coalescer is consulted ONLY when `txDepth == 0`.

Why: returning a cached SELECT inside a transaction violates Postgres isolation. The user's `SELECT FOR UPDATE` inside `BEGIN` cannot be served from cache.

This counter lives in pgproxy connection state — the prep step provides it. You receive it via context or a parameter. The pgproxy call site only invokes Lookup when depth is zero. **Trust this; do NOT call Lookup yourself.** Your job is to behave correctly when called.

### 4. What to coalesce

- Simple-protocol `Query` messages whose body, after whitespace, starts case-insensitively with `SELECT` or `WITH` (CTEs that resolve to selects).
- Extended-protocol `Parse`+`Bind`+`Execute` for the same prefix.

### 5. What to NEVER coalesce — deny list

Substring match (case-insensitive) on the canonicalized query text. If any of these appear, do not coalesce:

- `nextval(`, `setval(`, `currval(` — sequence reads have side effects / freshness expectations
- `random()`, `gen_random_uuid()` — non-deterministic
- `now()`, `current_timestamp`, `clock_timestamp()`, `statement_timestamp()` — time-sensitive
- `current_user`, `session_user`, `current_role` — context-sensitive
- `pg_advisory_lock`, `pg_advisory_unlock`, `pg_try_advisory_lock` — locks
- `pg_*_xact*`, `pg_current_xact_id`, `txid_*` — transaction metadata
- `for update`, `for share`, `for no key update` — locking SELECTs
- Any query containing `;` AFTER the trailing strip (multi-statement)

When a query is rejected by the deny list, **log it at info level** with the matched substring. This helps tune the list later.

### 6. TTL and storage

- Default TTL: **250ms**. Configurable via `--coalesce-ttl <duration>` flag (default `250ms`).
- Storage: in-memory `sync.Map` of `agentID → *agentCache`. Each `agentCache` has a bounded LRU (default 1000 entries; evict least-recently-used).
- No persistence. Cache is volatile by design.
- Write invalidation is OUT OF SCOPE for v1. The TTL contract — staleness ≤ TTL — is documented and accepted.

### 7. Response capture and replay

The proxy's `relay()` captures the upstream response bytes for a query (the sequence: `RowDescription`, zero-or-more `DataRow`, `CommandComplete`, `ReadyForQuery`). This raw byte sequence IS what you store in `Store(agentID, key, response)`.

On a future Lookup hit, the proxy writes those bytes directly to the client. Byte-for-byte identical to a fresh response. **Don't try to parse and re-serialize.** Don't re-issue the response with new timestamps or row IDs. The cached bytes ARE the response.

Critical: if the response includes a `RowDescription` with format codes that depend on Bind parameters (e.g., binary format), the cache key MUST include those Bind parameters' format codes. Include them in `CacheKey.Params` (the params field captures both values and formats).

### 8. Bound the cache

- Per-agent LRU bound default: 1000 entries.
- Per-entry size cap: don't cache responses >256KB. Past that, the cache becomes a memory leak under big-result workloads.
- TTL eviction lazy on Lookup (cheaper than a sweeper goroutine). Periodic LRU eviction on Store when the bound is hit.

## Files you own

- `proxy/internal/coalesce/` — new package:
  - `coalesce.go` — `Cache` type implementing `pgproxy.Coalescer`.
  - `key.go` — `CacheKey` normalization, deny-list matching.
  - `lru.go` — bounded LRU.
  - `*_test.go` — your tests.
- `proxy/cmd/vigil-proxy/main.go` — additive: parse `--coalesce-ttl`, instantiate `coalesce.New(ttl)`, assign to `Server.Coalescer`.

## Files you MUST NOT touch

- `proxy/internal/pgproxy/` — interfaces stable.
- `proxy/internal/ratelimit/` — Agent 1's.
- `proxy/internal/audit/` — read-only.
- `proxy/internal/identity/` — read-only.
- `app/`, `daemon/`, `site/` — out of scope.

## Acceptance criteria (all must pass in CI before opening the PR)

1. **THE BAR — bench rules.** `make bench BENCH_PRESET=refactor` reports dedup rate **≥40%**. This is the load-bearing test. The PR cannot merge if this fails.
2. **Per-agent isolation.** Same query under agent_id `A` then agent_id `B`: both reach upstream. The cache scope is per-agent.
3. **Transaction safety.** Inside `BEGIN; SELECT 1; SELECT 1; COMMIT;` — both SELECTs hit upstream. After COMMIT, a third identical SELECT hits cache.
4. **Deny-list.** Repeated identical `SELECT nextval('s')` calls all reach upstream. Verified with explicit query.
5. **TTL.** Two identical SELECTs 100ms apart: 2nd is cached. Two identical SELECTs 500ms apart (with 250ms TTL): 2nd hits upstream.
6. **Cache eviction.** Fill cache with 1000 distinct queries, the 1001st evicts the LRU entry. Re-querying the evicted one hits upstream.
7. **Response correctness.** Capture a fresh `SELECT id, name FROM t` response. Re-issue identical query → cached. Compare bytes — identical.
8. **Audit decision.** Coalesced queries land in audit with `decision='coalesced'`. Verified with a SQL count.
9. **Anonymous traffic does not coalesce.** Two clients with `agentID=""` issuing identical SELECTs: both reach upstream every time.

## Out of scope

- Write invalidation (v2).
- Cross-agent coalescing.
- Persistent cache.
- Cache warming / pre-population.
- Compression of stored responses.

## How to know you are done

- Acceptance #1 (bench bar) is THE measure. If `make bench` shows ≥40% dedup on refactor, you're 80% done.
- All 9 acceptance tests pass in CI.
- `proxy/bench/RESULTS.md` updated with the new dedup numbers (run `make bench` against your branch and commit the result).
- README updated to mention v0.1.0d coalescing.

## When you finish

Open a PR, request review from the lead agent. Do not merge yourself. The lead will:
- Review the deny-list for completeness.
- Verify the response replay is byte-identical.
- Confirm transaction safety.
- Pull the bench numbers and consider them ready for the homepage.

## When you get stuck

Two likely stuck points:

1. **Response capture.** The pgproxy code captures upstream response bytes per-query. If the seam isn't obvious, the prep PR should have the call sites marked. If unclear, write the question into a draft PR and ping the lead — better than guessing.

2. **The bench number is below 40%.** Investigate which workload queries miss your cache. Likely culprits: (a) queries that look identical to humans but differ by whitespace/comment, (b) queries hitting the deny-list spuriously, (c) responses too large (>256KB) and getting skipped. Add a `--coalesce-debug` flag that logs every miss with reason; tune accordingly. If you cannot get past 40% with reasonable tuning, **document the floor and what's blocking** — that's a finding the lead needs to see.
