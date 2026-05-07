# Conductor Prompt — Agent 2: app proxy overview tab

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to add a new "Proxy" tab to the existing Tauri app that surfaces proxy state by reading `~/.vigil/proxy.db` directly. Pulls week 11 of the canonical roadmap forward to week 6.

**Two other agents are working in parallel.** Agent 1 is rewriting the proxy's Postgres relay to write audit rows. Agent 3 is building a benchmark harness. Your work is purely on the app side and has zero file overlap with either.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec.
2. `docs/superpowers/specs/2026-05-07-three-agent-push-design.md` — this push's design, including your full scope.
3. `app/src-tauri/` — existing Tauri backend. Understand how the existing tabs read data.
4. `app/src/components/` — existing tab structure. Match the pattern.
5. The audit schema in the push spec — your fixture and reads must match it exactly.

## What you ship

A new `Proxy` tab in the Tauri app, alongside the existing tabs, with three panes:

1. **Identities pane.** List of issued identities (agent_id, agent_name, principal, scopes, expiration). Click an identity → see its recent activity in the audit feed.
2. **Live audit feed.** Streaming table of audit rows. Filter by agent, time window, decision (decision column doesn't exist in v0.1.0b's schema — leave the filter UI in place, wired to a placeholder, ready for v0.1.0c). Use a virtualized table — must render 1000 rows in <100ms.
3. **Counters.** Per-agent rollup: queries today, queries deduped (placeholder=0 until v0.1.0d), queries rate-limited (placeholder=0 until v0.1.0c).

## Schema you read (do not change)

This schema is the contract Agent 1 ships. Mirror it exactly in your fixture.

```sql
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,         -- RFC3339 with millis
  agent_id TEXT,            -- NULLABLE
  agent_name TEXT,
  conn_id TEXT NOT NULL,
  direction TEXT NOT NULL,  -- 'client' or 'server'
  msg_type TEXT NOT NULL,
  query_text TEXT,
  bytes INTEGER NOT NULL,
  sig TEXT NOT NULL
);
```

You read SQLite. You never write to proxy.db.

## Fixture mode

Until Agent 1 lands real data, you develop against a fixture proxy.db. Your tab must:
- Detect when `~/.vigil/proxy.db` is missing or empty.
- Generate an in-memory fixture: 5 identities (claude-code, cursor, codex, custom-agent, no-id), 1000 audit rows distributed across the last hour, query mix that looks like agent traffic (lots of duplicate SELECTs from claude-code, mixed analytics from cursor, etc.).
- Render the same UI against the fixture as it would against real data — no fixture-specific code paths in the UI layer.
- Show a small banner in dev: "Fixture data — proxy not running."

## Files you own

- `app/src/components/proxy/` — new directory: the entire Proxy tab UI.
- `app/src-tauri/src/proxy.rs` — new file: Tauri command `read_proxy_db(filter, cursor, limit)` returning paginated audit rows, plus `list_identities()` returning identities, plus `proxy_counters(agent_id, since)` returning the rollup.
- `app/src-tauri/src/lib.rs` or `main.rs` — additive: register the new commands.
- `app/src/types.ts` — additive only: add `ProxyIdentity`, `AuditRow`, `ProxyCounter` types. Do not change existing types.
- `app/src/App.tsx` — additive only: add the tab. Do not touch other tabs' code.

## Files you MUST NOT touch

- `proxy/` — Agents 1 and 3.
- `daemon/` — out of scope.
- Existing app tabs / components for Sessions / Overview — additive work only.
- Existing Tauri commands — do not rename or break them.

## Acceptance criteria

1. **Build.** `npm run build` (or whatever the app's build command is) passes for the new tab.
2. **Performance.** 1000-row audit feed renders in <100ms (virtualized).
3. **Filtering.** Filter by agent + time window updates results in <50ms.
4. **Regression bar.** Existing Sessions / Overview tabs render and behave identically. No imports / styles / state leaking across.
5. **Tauri unit tests.** Cover empty DB, missing DB, malformed DB, large DB (10k rows). Failure modes return Err to JS, not panics.
6. **Fixture mode.** Tab works end-to-end with no proxy.db on disk.

## Out of scope (do not implement)

- Writing to proxy.db (no policy editing, no identity creation from the app).
- Embedded MCP server, embedded Conductor views.
- Theming the new tab differently from existing tabs — match what's there.
- Charts / time-series visualizations beyond simple counters. Keep it tabular.

## How to know you are done

- The Proxy tab opens, shows fixture data on a fresh install.
- All acceptance tests pass.
- A 30-second screen recording demonstrates: open tab → see identities → click claude-code → see its audit feed → filter to last 5 min → counters update. Attach the recording (or asciinema cast) to the PR.

## When you finish

Open a PR against `main`, request review from the lead agent. Do not merge yourself. Your tab can land before Agent 1's work merges — fixture mode keeps it usable.

## When you get stuck

The most likely stuck point is virtualized rendering of large tables in the existing app's stack. If you spend more than 2 hours fighting it, drop to a simple paginated table (50 rows per page, prev/next) and note in the PR that we can virtualize later. Shipping the surface beats perfecting it.
