# Vigil Three-Agent Push — Design

**Date:** 2026-05-07
**Status:** Draft v1
**Owner:** Costa (orchestrated by Claude as lead agent)
**Related:**
- `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec
- `proxy/README.md` — current v0.1.0a state
- `wip/pre-pivot-snapshot` branch — preserved old-vision Tauri WIP

---

## Goal

Run three Conductor agents in parallel for one week to advance Vigil from v0.1.0a (Postgres bytes-passthrough) toward a venture-ready v0.1.0d demo (per-agent rate limit + fan-out coalescing with measured cost-savings benchmark).

The website is the contract. Every primitive promised on `bevigil.ai` (identity, rate-limit, coalesce, blast-radius, audit) must have a passing CI test before we claim it works.

## Operating Model

- **Lead agent (Claude):** orchestrator. Authors prompts, reviews PRs, writes specs, lands merges, owns the MCP server creative track.
- **Three Conductor agents:** parallel work surfaces. Each owns a distinct slice with no file-level overlap.
- **Acceptance bar:** every promise on the live website maps to one passing automated test in CI.
- **Scope:** website primitives + obvious gaps (e.g., what already exists in `daemon/`, `proxy/internal/identity/`). Open scope at agent's discretion only when it serves the venture-grade thesis (benchmarks, dogfooding hooks).

## Why this is venture-grade

The pivot to data-plane proxy was the convergent output of two independent deep research passes — meaning the wedge is downstream of how agent traffic actually shapes infrastructure load, not branding. Three things make this a real venture, and this push delivers all three:

1. **The benchmark.** A reproducible test harness that proves the homepage's "40–80% cost reduction from coalescing" claim. Becomes a Show HN top comment, a hero number, an email subject line.
2. **The MCP angle.** Vigil exposed as an MCP server lets Cursor / Claude Code / Codex query their own scope and audit trail. Vigil becomes infrastructure agents *use*, not just infrastructure ops people install. Viral install vector.
3. **Audit log as compliance hook.** Signed Ed25519 audit rows are what every SOC2/HIPAA/FedRAMP shop needs the moment they have agents in production. Free OSS daemon, paid hosted retention + team policy. Vercel/Hashicorp/Supabase playbook.

## Stream Boundaries

The three streams are designed to have **zero file-level overlap** so agents never collide:

| Stream | Owns paths | Touches DB? | Depends on |
|---|---|---|---|
| **Agent 1 — proxy v0.1.0b** | `proxy/internal/pgproxy/`, `proxy/internal/audit/` (new), `proxy/internal/identity/` (additive only) | Writes `audit` table | none (keystone) |
| **Agent 2 — app proxy overview tab** | `app/src/components/proxy/` (new), `app/src-tauri/src/proxy.rs` (new), `app/src/types.ts` (additive only) | Reads `proxy.db` (fixture, then real once A1 lands) | fixture proxy.db until A1 |
| **Agent 3 — coalescing benchmark harness** | `proxy/bench/` (new), root `Makefile` (additive `bench` target) | Reads through proxy | none — pass-through bench works against v0.1.0a |
| **Lead agent (me) — MCP server prototype** | `proxy/internal/mcpserver/` (new), `proxy/cmd/vigil-proxy/main.go` (additive flag) | Reads identity + audit tables | A1 audit schema (loose dep) |

## Stream 1 — Agent 1: proxy v0.1.0b (the keystone)

**Goal**

Replace the post-startup `io.Copy` relay in `proxy/internal/pgproxy/postgres.go` with a single-goroutine `pgproto3` message pump that:

1. Parses every Postgres frontend and backend message
2. Attaches agent identity to each parsed query (correlated via Postgres `application_name` startup parameter; verified against the identity issuer's signed token)
3. Writes a signed audit row per query into `~/.vigil/proxy.db.audit`
4. Forwards messages bytes-equivalent to upstream — the `psql` regression test from v0.1.0a must still pass

**Why this is the keystone**

The May 4 spec explicitly notes: "the post-startup relay is `io.Copy` ... `pgproto3.Backend` needs `SetAuthType()` called between an upstream `Authentication*` message arriving and the client's matching `'p'` response ... propagating it without a race requires per-message synchronization. That's design work that belongs in v0.1.0b — where we replace `io.Copy` with a single-goroutine message pump and gain the ability to attach identity headers anyway."

Identity attachment, audit, rate limiting, and coalescing all require this. Without it, every other primitive is blocked.

**Key design constraints**

- **Single-goroutine pump.** Use `select` on two `io.Reader`s with a per-side `pgproto3.Frontend`/`pgproto3.Backend`. Auth-type changes are visible in-band, no race.
- **SCRAM still works.** v0.1.0a regressed to `io.Copy` in `1885b76` precisely because SCRAM auth broke under earlier message-level proxying. Fix this properly: implement `SetAuthType()` correctly when `AuthenticationSASL` arrives.
- **Identity attachment via `application_name`.** When the client sends `StartupMessage`, parse the parameter list. If `application_name` matches `vigil:<token>`, verify the Ed25519 signature against the identity store, look up the `agent_id`, attach to connection state. Fall back to `unknown` if absent or invalid (don't reject — observability before enforcement).
- **Audit schema** (additive — store stays compatible with v0.1.0a):
  ```sql
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    agent_id TEXT,            -- NULL if no identity attached
    agent_name TEXT,          -- e.g. "claude-code"
    conn_id TEXT NOT NULL,    -- per-connection UUID
    direction TEXT NOT NULL CHECK (direction IN ('client','server')),
    msg_type TEXT NOT NULL,   -- e.g. "Query","Parse","Bind","Execute"
    query_text TEXT,          -- for Query / Parse only
    bytes INTEGER NOT NULL,
    sig TEXT NOT NULL         -- Ed25519 signature over canonical row
  );
  CREATE INDEX idx_audit_ts ON audit(ts);
  CREATE INDEX idx_audit_agent ON audit(agent_id, ts);
  ```
- **Signature canonical form.** `agent_id|conn_id|ts|msg_type|len(query_text)|sha256(query_text)`. Sign with the existing issuer key. Verify in tests.

**Acceptance (CI)**

1. `psql` end-to-end smoke test (`scripts/smoke-postgres.sh`) still passes — regression bar from v0.1.0a.
2. New test: `psql` with `application_name=vigil:<valid-token>` lands `agent_id` in audit rows for every query.
3. New test: `psql` with `application_name=vigil:<invalid-token>` proxies normally, audits with `agent_id=NULL`. Identity verification failure is non-fatal.
4. New test: SCRAM auth (modern Postgres default) works through the proxy. This is the regression that bit `1885b76`.
5. New test: 1000 sequential `SELECT 1` queries → 1000 audit rows, each with valid Ed25519 signature.
6. Bench (called by Agent 3): added latency p50 < 1ms, p99 < 5ms vs direct connection.

**Out of scope (deferred to v0.1.0c/d)**

- Rate limiting, fan-out coalescing, policy enforcement, prepared-statement caching, TLS termination, Prometheus metrics.

## Stream 2 — Agent 2: app proxy overview tab

**Goal**

Add a new tab to the existing Tauri app that surfaces proxy state by reading `~/.vigil/proxy.db` directly. Pulls spec week 11 forward.

**Why now**

The app today shows demo data only. Once Agent 1 lands real audit rows, this tab lights up automatically — no further coordination required. We get a real product surface in one week instead of six.

**Scope**

- New tab labeled "Proxy" alongside the existing Overview / Sessions tabs.
- Three panes:
  - **Identities pane.** List of issued identities with agent_name, principal, scopes, expiration. Click an identity → see its recent activity.
  - **Live audit feed.** Streaming table of audit rows. Filter by agent, time window, decision (allowed/coalesced/rate-limited/denied — ready for v0.1.0c+).
  - **Counters.** Per-agent: queries today, queries deduped (placeholder=0 until v0.1.0d), queries rate-limited (placeholder=0 until v0.1.0c).
- Tauri command `read_proxy_db` returns audit rows with cursor pagination. SQLite reads only — no writes from the app.
- Fixture mode: if `~/.vigil/proxy.db` doesn't exist or is empty, render a `dev` fixture with synthetic identities + audit rows so the UI can be developed and reviewed without Agent 1 having landed.

**Acceptance (CI)**

1. Tauri app builds with the new tab against fixture proxy.db.
2. Audit feed renders 1000 rows in <100ms (virtualized table).
3. Filter by agent + time window updates results in <50ms.
4. Existing Sessions / Overview tabs unaffected (regression bar).
5. Tauri command unit tests cover empty DB, missing DB, malformed DB, large DB (10k rows).

**Out of scope**

- Writing to proxy.db, configuring policies, mutating identities (that's a future "Console" surface).
- Embedded Conductor / Claude Squad views — those stay in their existing tabs.

## Stream 3 — Agent 3: coalescing benchmark harness

**Goal**

Build the reproducible test harness that proves the website's "40–80% cost reduction" claim. Real Postgres in Docker, synthetic-but-realistic agent workload, measure with vs without proxy. Currently the proxy is pass-through so coalescing % = 0% — the harness becomes the v0.1.0d acceptance test once that ships.

**Why this is venture-grade**

A reproducible benchmark with public results turns "we think coalescing helps" into "we measured 67% reduction on this workload, here's the test, run it yourself." This is the homepage hero, the Show HN comment, and the email subject line.

**Scope**

- New directory `proxy/bench/`.
- Workload generator (Go): configurable mix of duplicate SELECTs (the agent-rediscovery pattern), aggregation queries, hot-key reads, INSERTs. Realistic shape: an agent fires the same `SELECT * FROM users WHERE email = ?` 200 times in 30 seconds, plus background analytics.
- Three workload presets: `refactor` (heavy duplicate SELECTs), `mixed` (refactor + analytics), `production` (low-rate baseline traffic).
- Runner: spins up ephemeral Postgres in Docker, runs workload twice (direct, then through proxy), captures per-query latency, throughput, dedup rate, total queries that hit upstream.
- Emits `bench/RESULTS.md` and `bench/results.json` with: total queries issued, queries that hit upstream, dedup rate, p50/p95/p99 latency, throughput, end-to-end wall time.
- Root `Makefile` target: `make bench` runs the whole thing end-to-end.

**Acceptance (CI)**

1. `make bench` runs end-to-end against ephemeral Docker Postgres in <60s.
2. Emits `RESULTS.md` with the three presets, formatted for the website to ingest.
3. Today (pass-through proxy) reports dedup rate ≈ 0% — sanity check.
4. Latency overhead through proxy reported (informs Agent 1's perf bar).
5. Workload generator deterministic when seeded (reproducibility).

**Stretch (if Agent 1 lands fast)**

If Agent 1's audit table is populated by the time Agent 3 finishes the harness, run an additional preset that exercises identity-attached queries and measures the audit-write overhead.

**Out of scope**

- The actual coalescing implementation (that's v0.1.0d, week 5).
- Redis or HTTP workloads (Postgres-only for v0).

## Lead agent creative track — MCP server prototype

**Goal**

Pull spec week 9 (MCP server) forward to week 6. Expose the proxy's primitives — identity issuance, identity lookup, activity query, policy check — as an MCP server so coding agents can introspect their own scope and audit trail.

**Why this matters**

Vigil's pitch is "agent-aware data plane." If Vigil itself is the most agent-aware tool — i.e., the agents using Vigil can query Vigil — that's the dogfood story. Cursor and Claude Code can both consume MCP servers natively today. The first time a developer asks Claude Code "what scope am I in?" and Claude Code calls `vigil.identity.whoami`, we have a viral install moment.

**Scope (week 1)**

- Spec: `docs/superpowers/specs/2026-05-07-mcp-server-design.md` (separate doc).
- Prototype: `proxy/internal/mcpserver/` exposes:
  - `vigil.identity.issue` — create a new identity (admin only, behind a flag).
  - `vigil.identity.whoami` — return the calling agent's identity, principal, scopes.
  - `vigil.activity.query` — query the audit log for the calling agent.
  - `vigil.policy.check` — given a (route, action), return whether the calling agent is allowed (placeholder=true until v0.1.0e policy engine).
- Spec the auth model: how does the MCP server know which agent is calling it? (Likely: agents pass their issued token in MCP headers; MCP server verifies against identity store.)

**Acceptance**

This is exploratory — no CI bar this week. Deliverable is a written spec the agents can implement against in a future push, plus a prototype that demonstrates `vigil.identity.whoami` working end-to-end with one of the three streams' agent identities.

## Branch and merge protocol

- Each agent works in its own Conductor worktree branched from `main` at `14b4878`.
- One PR per agent, targeting `main`. Lead agent (me) reviews each PR before approve.
- Conflicts: by design, file boundaries above prevent file-level conflicts. If they happen anyway, lead agent resolves before merge.
- Merge order: Agent 2 and Agent 3 can merge anytime (independent surfaces). Agent 1 merges last only because its audit-table writes change real data shape — Agents 2 and 3 should land their fixtures first so they're not destabilized by A1's data.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Agent 1's pgproto3 message pump regresses SCRAM auth (the bug that caused commit 1885b76 to revert to io.Copy) | Acceptance test #4 explicitly covers SCRAM. Test must pass before merge. |
| Agent 2 develops against a fixture that doesn't match Agent 1's audit schema | Audit schema in this spec is the contract. Agent 1 must match it exactly. Agent 2 mirrors it in fixture. |
| Agent 3's benchmark numbers are unrepresentative or unreproducible | Workload presets are documented and seeded. Results include test config so anyone can re-run. |
| Lead agent's MCP work introduces a new auth model that conflicts with Agent 1's identity attachment scheme | MCP work is exploratory + spec-only this week. Implementation aligns with whatever A1 ships. |
| Three agents working in parallel produce three different code styles | One Go style guide pass after all three merge. Acceptable cost. |
| Old-vision Tauri refactor on `wip/pre-pivot-snapshot` rots and is forgotten | Spec mentions it as the source for evolving the Tauri Overview pane in a future milestone. Branch is preserved. |

## Definition of done (this push)

- All three agent PRs merged to `main`.
- All acceptance criteria above passing in CI.
- `proxy/bench/RESULTS.md` exists with at least one preset's numbers.
- New `Proxy` tab visible in Tauri app, lights up against real audit rows.
- Lead agent's MCP server spec written and reviewed by user.
- One paragraph in `proxy/README.md` describing the v0.1.0b state and the path to v0.1.0d.

## What this push does NOT include

- Rate limiting (v0.1.0c — next push).
- Fan-out coalescing implementation (v0.1.0d — next push, validated against Agent 3's harness).
- Policy enforcement, blast-radius UI, Redis support, HTTP/L7 proxy, signed transparency log.
- Show HN launch (artifact gathered, post drafted, but not posted until v0.1.0d numbers are real).
- Public design partner outreach (separate workstream when binary is one-command-installable).

---
