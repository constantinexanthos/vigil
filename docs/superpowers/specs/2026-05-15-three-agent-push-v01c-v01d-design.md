# Three-Agent Push — v0.1.0c + v0.1.0d (Rate Limit + Coalesce)

**Date:** 2026-05-15
**Status:** Draft v1
**Owner:** Costa (orchestrated by Claude as lead agent)
**Related:**
- `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec
- `docs/superpowers/specs/2026-05-07-three-agent-push-design.md` — previous push (v0.1.0b)
- `docs/superpowers/specs/2026-05-07-mcp-server-design.md` — lead agent's deferred MCP track

---

## Goal

Advance Vigil from v0.1.0b (identity + signed audit) to v0.1.0d (rate limit + fan-out coalescing) in one parallel push. The website's headline claim — "40–80% cost reduction from coalescing" — becomes a measured number we can publish, not a promise.

After this push, **four of the five primitives on `bevigil.ai` are real**: identity, audit, rate-limit, coalesce. Only blast-radius (policy) remains.

## Why now

- v0.1.0b's message pump exposes every parsed Postgres frame to in-process logic. Both rate-limiting and coalescing slot into that hot path. The keystone is in.
- The bench harness from PR #12 reports 0% dedup today and is sitting waiting for v0.1.0d to fire. The same harness re-runs and produces our hero number.
- The Tauri Proxy tab has placeholder counters for "deduped" and "rate-limited" that are zeros. They light up automatically the moment the proxy writes to a new `decision` column (added in prep step).
- Waitlist is live and accepting signups. Every day we're closer to v0.1.0d is a day closer to a launch email subject line of "we cut Postgres bills 60% — here's the proof."

## Operating model

Same as last push:
- **Lead agent (Claude):** orchestrator. Drafts prep PR, writes prompts, reviews PRs, lands merges, runs the MCP-server prototype as creative track.
- **Three Conductor agents:** parallel work surfaces, zero file-level overlap by design.
- **Acceptance bar:** every claim that lights up has a passing CI test. Coalescing's specific bar: **Agent 3's bench harness reports >40% dedup rate on the `refactor` preset.**

## Lead-agent prep step (Task 0 — me, before agents dispatch)

Both agents need stable seams in the proxy. Pre-defining them in a single small PR avoids file collision in the message pump and audit schema.

**Scope of prep PR:**
1. Add `RateLimiter` interface in `proxy/internal/pgproxy/pgproxy.go` (or new `interfaces.go`):
   ```go
   type RateLimiter interface {
       // Acquire blocks until the calling agent is permitted to send one
       // more message of the given route. Returns nil on permit, or an
       // error to reject (e.g., agent over quota).
       Acquire(ctx context.Context, agentID, route string) error
   }
   ```
2. Add `Coalescer` interface:
   ```go
   type Coalescer interface {
       // Lookup checks the per-agent query cache. Returns the cached
       // server-response bytes and true on hit, or nil and false on miss.
       Lookup(agentID string, key CacheKey) (response []byte, hit bool)
       // Store records a server response under the given key with the
       // implementation's configured TTL.
       Store(agentID string, key CacheKey, response []byte)
   }

   type CacheKey struct {
       QueryText string   // canonicalized query text
       Params    [][]byte // bind parameters (for extended-protocol Parse/Bind)
       Database  string   // logical database name from startup
       User      string   // role from startup
   }
   ```
3. Add `RateLimiter` and `Coalescer` fields to `Server` struct, both with no-op defaults wired in `relay()`. Default behavior = today's behavior (everything passes through).
4. Schema migration: add `decision TEXT NOT NULL DEFAULT 'allowed'` to audit table. Idempotent. Update `audit.Writer.Append` signature to accept decision string. Existing v0.1.0b audit rows backfill as `'allowed'` per default.
5. CI green: existing tests still pass. No behavior change yet.

**Done means:** prep PR merges to `main`. Agents 1 and 2 implement the interfaces. Agent 3 reads the new column.

## Stream boundaries

Same zero-overlap model as last push:

| Stream | Owns paths | Reads | Writes |
|---|---|---|---|
| **Agent 1 — rate limiting** | `proxy/internal/ratelimit/` (new), `proxy/cmd/vigil-proxy/main.go` (additive wiring) | identity store | audit `decision='rate_limited'` rows when applicable |
| **Agent 2 — coalescing** | `proxy/internal/coalesce/` (new), `proxy/cmd/vigil-proxy/main.go` (additive wiring) | identity store | audit `decision='coalesced'` rows when applicable |
| **Agent 3 — Tauri polish + real telemetry** | `app/src/components/proxy/` (additive), `app/src-tauri/src/proxy.rs` (additive queries), `app/src/types.ts` (additive only) | new audit `decision` column | nothing |
| **Lead (me) — MCP server prototype** | `proxy/internal/mcpserver/` (new), `proxy/cmd/vigil-proxy/main.go` (additive flag) | identity, audit | MCP tool calls land in audit |

Both Agent 1 and Agent 2 add lines to `main.go` to wire their implementations. Tiny risk of textual conflict on adjacent lines — handled by merging Agent 1 first, then Agent 2 rebases on top.

## Stream 1 — Agent 1: rate limiting (v0.1.0c)

**Goal:** Implement per-agent token-bucket rate limiting that plugs into the `RateLimiter` seam from prep.

**Design constraints:**
- **Per-agent** by `agent_id`. Anonymous traffic (no identity) gets its own bucket too — `agent_id=""`.
- **Pools** so traffic classes are isolated. Default config:
  - `production` pool: large burst, large refill (e.g., 1000 burst, 500/sec)
  - `agents` pool: smaller, configurable per-agent (default 100/sec)
  - `unauth` pool: tightest (default 10/sec) — defense against rogue clients
- **Per-route** weighting so reads don't starve writes (or vice versa). The `route` argument from the Acquire call is one of: `query`, `parse`, `bind`, `execute`, `simple_query`. v1: same bucket for all routes; weighting is v2.
- **Algorithm:** classic token bucket with monotonic refill. Use a fast in-memory map keyed by (agent_id, pool). No external dependencies; the proxy is a single binary.
- **Action when over limit:** **block** (Acquire waits up to ctx.Done()) for v1. Reject (return error → translates to a Postgres `ErrorResponse` to the client) is v2 — easier to reason about block-only first.
- **Config file:** YAML or TOML, loaded at startup. New flag `--ratelimit-config <path>`. If unset, defaults are baked in (the per-agent + production pools above).

**Files owned:**
- `proxy/internal/ratelimit/` — new package: bucket data structure, refill loop, config loading.
- `proxy/cmd/vigil-proxy/main.go` — additive: parse `--ratelimit-config` flag, instantiate, wire to `Server.RateLimiter`.
- Tests: `proxy/internal/ratelimit/*_test.go`.

**Files NOT to touch:**
- `proxy/internal/pgproxy/` — interfaces are stable from prep step. Just consume them.
- `proxy/internal/coalesce/` — Agent 2's territory.
- `app/`, `daemon/`, `site/` — out of scope.

**Acceptance (CI):**
1. **Behavior unit test.** Agent A in `agents` pool with bucket size 10 sends 12 messages — first 10 acquire immediately, remaining 2 block until refill.
2. **Pool isolation test.** Agent A in `agents` pool exhausts its bucket; agent B in `production` pool is unaffected.
3. **Anonymous bucket test.** Two unidentified clients share the `unauth` pool; one exhausting it doesn't block traffic from identified agents.
4. **Audit decision.** Rate-limited messages land in audit with `decision='rate_limited'`. Allowed messages remain `'allowed'`.
5. **Config file parse.** Pre-shipped fixture configs in `proxy/internal/ratelimit/testdata/` parse cleanly. Bad configs fail loud at startup, not at first request.
6. **Bench impact.** Agent 3's bench harness still runs <60s end-to-end with rate limiting active at default settings (no contention with the bench's connection volume).

**Out of scope:**
- Reject-on-overlimit (v2). v1 is block-only.
- Per-route weighting (v2). v1 same bucket for all routes.
- Distributed rate limiting across proxy instances. v1 is single-binary.

## Stream 2 — Agent 2: fan-out coalescing (v0.1.0d)

**Goal:** Implement the per-agent query result cache that plugs into the `Coalescer` seam. Acceptance bar is unambiguous: **the existing bench harness must report ≥40% dedup rate on the `refactor` preset.**

**Design constraints — the load-bearing details:**
- **Per-agent only.** Different agents have different RLS context, search_paths, role memberships → never share results across agent_id. Anonymous traffic does NOT coalesce (no shared identity = no safe cache key).
- **Cache key:** `(agent_id, database, user, normalized_query_text, params)`. Normalize query text by stripping whitespace runs and trailing semicolons. Don't normalize identifiers — case matters in Postgres for quoted identifiers.
- **TTL:** default 250ms. Configurable per-route. The website's claim is "fan-out coalescing" — agents fire 200 SELECTs in 30 seconds because the LLM keeps re-discovering the same query. A 250ms TTL captures the burst without storing stale data for long.
- **Transaction safety — DO NOT COALESCE inside a BEGIN.** Track per-connection transaction state (incremented on BEGIN, decremented on COMMIT/ROLLBACK). Coalescer is consulted only when transaction depth = 0. This is non-negotiable: returning a cached SELECT inside a transaction violates Postgres isolation guarantees.
- **What to coalesce:** simple-protocol `Query` messages whose body starts with `SELECT` (case-insensitive after whitespace), and extended-protocol `Parse`+`Bind`+`Execute` sequences for SELECTs. Skip everything else.
- **What to NOT coalesce:** anything containing `pg_advisory_lock`, `nextval(`, `random()`, `now()`, `current_timestamp`, `current_role`, or `pg_*_xact*`. Hand-list these as deny-prefix substring matches. Log when a query is coalesce-ineligible due to deny-list match (helps tuning).
- **Cache invalidation:** TTL only for v1. Write invalidation (INSERT/UPDATE/DELETE on table X invalidates SELECTs against X) is v2 — hard problem because Postgres can have triggers, views, RLS policies that make table-level invalidation imprecise. The TTL contract is documented: staleness ≤ 250ms is acceptable.
- **Storage:** in-memory `sync.Map` or LRU. Bound the cache size (default 1000 entries per agent, evict LRU). No SQLite, no disk — coalesce cache is volatile by design.
- **Response replay:** when a cache hit fires, the proxy must synthesize the full Postgres response sequence to the client (RowDescription + DataRow* + CommandComplete + ReadyForQuery). The cached response bytes ARE these frames captured during the original upstream response. On replay, just write them to the client connection in order.

**Files owned:**
- `proxy/internal/coalesce/` — new package: cache, key normalization, TTL eviction, response capture/replay.
- `proxy/cmd/vigil-proxy/main.go` — additive: instantiate, wire to `Server.Coalescer`.
- Tests: `proxy/internal/coalesce/*_test.go`.

**Files NOT to touch:**
- `proxy/internal/pgproxy/` — interfaces stable.
- `proxy/internal/ratelimit/` — Agent 1's.
- `app/`, `daemon/`, `site/` — out of scope.

**Acceptance (CI):**
1. **Bench bar — the headline.** `make bench` against `refactor` preset reports dedup rate ≥40%. This is the unambiguous v0.1.0d success criterion.
2. **Per-agent isolation.** Agent A's cached `SELECT 1` is NOT served to agent B. Tested by running same query under different identities, asserting both hit upstream.
3. **Transaction safety.** Inside `BEGIN; SELECT 1; SELECT 1; COMMIT;`, both SELECTs hit upstream. Outside the transaction, the second hits cache.
4. **Deny-list.** A query containing `nextval(` is never coalesced. Verified by repeated identical calls all reaching upstream.
5. **TTL.** Two identical SELECTs 100ms apart → second is cached. Two identical SELECTs 500ms apart → second hits upstream.
6. **Cache eviction.** With 1000-entry limit, the 1001st distinct query evicts the LRU entry.
7. **Response correctness.** A coalesced response, byte-compared against a fresh response, is identical (same RowDescription column types, same DataRow contents).
8. **Audit decision.** Coalesced queries land in audit with `decision='coalesced'`.

**Out of scope:**
- Write invalidation. TTL only.
- Cross-agent coalescing.
- Persistent cache across restarts.
- Cache warming.

## Stream 3 — Agent 3: Tauri polish + real telemetry

**Goal:** Light up the placeholder counters in the Proxy tab with real numbers from the new `decision` column. Polish the first-launch experience.

**Scope:**
1. **Wire real counters.** The "Queries deduped" and "Queries rate-limited" placeholders in `app/src/components/proxy/CountersPane.tsx` should now query `audit WHERE decision='coalesced'` and `decision='rate_limited'` respectively, scoped per agent. Update `app/src-tauri/src/proxy.rs` `proxy_counters()` to compute them.
2. **Real-time refresh.** Poll for new audit rows every 2 seconds (configurable, off by default if `~/.vigil/proxy.db` doesn't exist). When new rows arrive, append to the feed without losing scroll position. Show a small "Live" indicator.
3. **First-launch / empty state.** When `~/.vigil/proxy.db` doesn't exist, the tab today shows fixture data with a banner. Improve the banner: explain what the proxy does, link to the GitHub readme, show the 3 commands needed to start it (`brew install vigil`, `vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432`, then "your queries will appear here"). Make it look like onboarding, not a dev fallback.
4. **Decision filter dropdown.** The audit feed already has a `decision` filter dropdown that's wired to a placeholder. Make it functional: filter by `'allowed'` / `'rate_limited'` / `'coalesced'` / "All".
5. **Counter delta animation.** When a counter increments via the live refresh, briefly highlight the new value (subtle background flash, ~400ms). Small detail; pays off in feeling-alive moments during demos.

**Files owned:**
- `app/src/components/proxy/` — modify CountersPane, AuditFeed (filter wiring), useProxyData (polling); add EmptyStateOnboarding.
- `app/src-tauri/src/proxy.rs` — additive: real counter queries, decision filter parameter.
- `app/src/types.ts` — additive: `Decision` union type.
- Tests in `app/src/components/proxy/__tests__/`.

**Files NOT to touch:**
- Other tabs in `app/src/components/` — keep additive, don't refactor.
- Existing Tauri commands — additive only.
- `proxy/`, `daemon/`, `site/` — out of scope.

**Acceptance (CI):**
1. **Real counter math.** Given a fixture audit table with 100 allowed + 30 coalesced + 5 rate-limited rows, CountersPane displays the right numbers per agent.
2. **Decision filter.** Selecting "Coalesced" in the dropdown filters the feed to only `decision='coalesced'` rows. Tauri call passes the parameter; SQL applies the filter.
3. **Polling.** Polling fires every 2s when active, doesn't fire when fixture mode is on. Stops on tab unmount. Existing tests still pass.
4. **Empty state.** With no proxy.db on disk, onboarding panel renders with the 3-command quickstart visible. Snapshot test asserts the panel content.
5. **Counter delta animation.** When counter value transitions from 5 → 6, the cell gets the highlight class for ~400ms then removes it.
6. **Regression bar.** All 178 existing npm tests + 28 cargo tests pass.

**Out of scope:**
- Charts (line charts of dedup-rate-over-time would be nice — v2).
- Writing to proxy.db from the app.
- New tabs.

## Lead-agent creative track — MCP server prototype

**Goal:** Implement the MCP server's first two tools — `vigil.identity.whoami` and `vigil.activity.query` — over stdio. Demonstrable in Claude Code via `~/.claude/mcp.json` install.

**Scope (minimal, demoable):**
- New package `proxy/internal/mcpserver/`.
- New flag `--mcp-stdio` on `vigil-proxy`. When set, the binary runs as a stdio MCP server instead of the HTTP/Postgres proxies.
- Auth: `clientInfo.vigil_token` from MCP `initialize` request → verify via `identity.Issuer.Verify` → bind agent to session.
- Tools:
  - `vigil.identity.whoami` — return calling agent's identity.
  - `vigil.activity.query` — query last N audit rows scoped to calling agent.
- README snippet showing the `~/.claude/mcp.json` install line.

**Acceptance:** install in Claude Code. Ask `"use vigil to tell me my identity"` and it works. No CI bar this push — it's exploratory + demoable, not production-critical.

## Branch + merge protocol

- Each agent branches from `main` at the prep PR's merge commit.
- One PR per agent, targeting `main`. Lead reviews each before approve.
- **Merge order: Agent 1 first** (rate-limit lands cleanly, no shared cache state), **then Agent 2** (rebases on Agent 1, the small main.go diffs reconcile easily), **then Agent 3** (Tauri reads from both and lights up).
- Lead's MCP PR merges anytime — orthogonal to the data-plane stack.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Coalescing returns stale result inside a transaction | Mandatory CI test #3 enforces transaction-depth gating. Reject the PR if it doesn't pass. |
| Coalescing breaks queries with side effects (`nextval`, `now()`) | Hard-coded deny-list of substring matches. Agent 2's CI test #4 enforces. |
| Rate limiter blocks the bench harness, distorts dedup numbers | Agent 1's default `production` pool (1000 burst, 500/sec) easily handles bench traffic. Agent 1's CI test #6 explicitly verifies. |
| Agent 1 + Agent 2 conflict in main.go wiring | Adjacent-line conflict only. Agent 1 merges first; Agent 2 rebases. Trivial. |
| Schema migration breaks v0.1.0b audit databases | Default value on the new column means existing rows backfill silently. Migration is idempotent CREATE-IF-NOT-EXISTS pattern. Verified in prep PR. |
| Bench number is below 40% | The deny-list might be over-aggressive. Agent 2 should track which queries miss due to deny-list and report; we tune in a v0.1.0d.1 patch. |
| MCP server token exchange isn't standardized yet | Lead-agent prototype uses `clientInfo.vigil_token` per the spec. If MCP introduces a standard later, we adapt. v1 is exploratory. |

## Definition of done

- All three agent PRs merged to `main`.
- All acceptance criteria above passing in CI.
- `proxy/bench/RESULTS.md` updated with v0.1.0d numbers showing **>40% dedup on the refactor preset**. This file is the launch-email subject line.
- New `Proxy` tab in Tauri app shows real numbers from a live proxy.db.
- Lead-agent MCP server callable from Claude Code.
- Updated `proxy/README.md` describing v0.1.0d state.

## What this push does NOT include

- Policy enforcement (v0.1.0e, next push).
- Redis support, HTTP/L7 proxy.
- Signed transparency log.
- Show HN launch (the bench number from this push is the prerequisite; launch is the next push's prerequisite).
- Public design partner outreach (separate workstream once we have a v0.2.0 tag).

---
