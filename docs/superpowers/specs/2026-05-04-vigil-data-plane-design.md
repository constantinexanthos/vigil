# Vigil Data Plane — Design

**Date:** 2026-05-04
**Status:** Draft v0
**Owner:** Costa
**Related:** `Vigil Startup Ideas — Strategy Catalog` (Obsidian), `POSITIONING.md` (legacy)

---

## Goal

Build the **agent-aware data plane** for AI agent traffic — a smart middleware that sits between agents and the systems they touch (databases, APIs, internal services), shaping traffic the way agent traffic actually behaves rather than pretending it's human.

This is an evolution of Vigil's existing observation thesis (the daemon watches what agents do) into an interception thesis (the proxy actively shapes what agents do).

## Non-Goals

- Replace the existing Vigil daemon. The daemon stays, captures cross-vendor agent activity at the OS / filesystem layer.
- Replace the existing Tauri app. The Overview pane evolves to surface proxy state.
- Compete with orchestration platforms (Conductor, BAND, Sycamore). We sit *below* them in the stack.
- Compete with foundation-lab agent identity (Microsoft Entra Agent ID, Anthropic agent auth). We integrate with whatever identity primitive the agent ecosystem standardizes on.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   AGENTS                                │
│   Claude Code · Cursor · Codex · Custom · LangGraph     │
└──────────────┬──────────────────────────────────────────┘
               │ requests carry agent-identity header
               ▼
┌─────────────────────────────────────────────────────────┐
│              VIGIL PROXY (this work)                    │
│                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│   │  Identity    │  │ Rate Limit   │  │  Coalesce    │ │
│   │  Issuer      │  │  per-agent   │  │  fan-out     │ │
│   └──────────────┘  └──────────────┘  └──────────────┘ │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│   │   Policy     │  │    Audit     │  │     MCP      │ │
│   │  enforce     │  │    Trail     │  │   Server     │ │
│   └──────────────┘  └──────────────┘  └──────────────┘ │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│   BACKENDS · Postgres · Redis · HTTP APIs · gRPC        │
└─────────────────────────────────────────────────────────┘

         ┌────────────────────────────┐
         │   Vigil Daemon (existing)  │  ← captures filesystem
         │   Vigil App (existing)     │  ← shows operator view
         └────────────────────────────┘
```

The proxy is a separate Go binary. It writes audit events to a shared SQLite database the daemon and app already read. The Tauri app's existing Overview pane gets a new tab that visualizes proxy state.

## Components

### 1. Identity Issuer
- Issues stable, signed agent identities (Ed25519).
- HTTP API: `POST /identities`, `GET /identities/{id}`, `GET /identities`.
- Tokens carry: agent_id, agent_name (claude-code, cursor, etc.), human_principal (whoever the agent acts for), scopes (read-only, write, full), expiration.
- Stored locally; later: federatable and exportable.

### 2. Rate Limit
- Per-agent token-bucket throttling.
- Pools: per-agent, per-pool (production-vs-agents), per-route (writes-vs-reads).
- Configurable via policy file.

### 3. Coalesce
- Detect identical or near-identical queries from the same agent within a window.
- Serve cached result on duplicate.
- Configurable cache TTL per route.

### 4. Policy
- Rule engine. "Agent X cannot DELETE from production." "Agent Y cannot touch /migrations/."
- Evaluated at request time. Block, warn, or require approval.

### 5. Audit Trail
- Every request: agent_id, route, action, decision (allowed / denied / coalesced / queued), timestamp, signed.
- Written to SQLite for query, optionally Sigstore-style transparency log for tamper-evidence.

### 6. MCP Server
- Exposes proxy state to agents themselves.
- Tools: `vigil.identity.issue`, `vigil.identity.list`, `vigil.activity.query`, `vigil.policy.check`.
- Lets agents introspect their own identity and the rules they're operating under.

## v0 Build Sequence (12 weeks)

| Week | Ships |
|---|---|
| 1–2 | Identity issuer + HTTP API + tests |
| 3 | Postgres proxy passthrough — **v0.1.0a shipped:** bytes-equivalent passthrough only. Identity attachment + audit move to v0.1.0b. |
| 4 | Per-agent token-bucket rate limit |
| 5 | Fan-out coalescing for SELECT queries |
| 6 | Policy engine v0 (table-name allow/deny lists) |
| 7 | Redis support |
| 8 | HTTP API proxy (generic L7) |
| 9 | MCP server |
| 10 | Audit trail signed + Sigstore-style log |
| 11 | Dashboard integration with existing Tauri app |
| 12 | Five design partners onboarded · public Show HN |

## v0.1.0a — Postgres Wire Passthrough (this milestone)

Bytes-equivalent Postgres proxy. Vigil sits between a Postgres client and the upstream server and forwards every byte without modification.

The test bar is **`psql` works identically through the proxy**: same query results, same errors, same transaction behavior, same prepared-statement support, same SCRAM authentication. If we change query semantics in v0.1.0a, we have failed.

What ships:

- `proxy/internal/pgproxy/` — `Server` type with `ListenAndServe(ctx)`. Per-connection: dial upstream, parse the startup phase in-band (SSL/GSS decline, StartupMessage forwarding), then run `io.Copy` in both directions until either side EOFs.
- Three new flags: `--postgres-listen`, `--postgres-upstream`, `--postgres-disabled` (gating). Empty listen leaves the Postgres proxy off; HTTP identity server still runs unconditionally.
- SSL declined with single byte `'N'`; clients fall back to plaintext per Postgres convention. TLS termination is a tracked TODO.
- Upstream-unreachable returns FATAL `08006` ErrorResponse to the client (Postgres-shaped error, not TCP RST).
- Five unit tests cover the relay, SSL decline, startup forwarding, upstream-unreachable error, and client mid-stream disconnect cleanup. Plus a `scripts/smoke-postgres.sh` end-to-end test against real Docker Postgres.

**Implementation note — pgproto3 deferred to v0.1.0b.** The brief said "use pgproto3 for wire protocol parsing." We ship pgproto3 in the codebase (used in startup-phase decoding and to synthesize the FATAL ErrorResponse on dial failure) but the post-startup relay is `io.Copy`. Reason: `pgproto3.Backend` needs `SetAuthType()` called between an upstream `Authentication*` message arriving and the client's matching `'p'` response, because the wire format of `'p'` (`PasswordMessage` vs `SASLInitialResponse` vs `SASLResponse`) is context-dependent on the most recent auth challenge. In a two-goroutine relay, the auth-type signal lives on the upstream→client side and the parser lives on the client→upstream side, so propagating it without a race requires per-message synchronization. That's design work that belongs in v0.1.0b — where we replace `io.Copy` with a single-goroutine message pump and gain the ability to attach identity headers anyway.

Out of scope for v0.1.0a, all named in the brief and tracked for later milestones:

- Identity attachment (v0.1.0b)
- Audit log (v0.1.0b)
- Rate limiting (v0.1.0c)
- Fan-out coalescing (v0.1.0d)
- Policy enforcement
- Connection pooling (still 1:1)
- TLS termination
- Prepared-statement caching
- Prometheus metrics
- SQL parsing — message-type-level visibility deferred to v0.1.0b along with the pgproto3 message pump

## v0.0.1 — This Commit

The smallest valuable shipping unit:

- Go module at `proxy/`
- `vigil-proxy` binary
- HTTP server on configurable port
- `POST /identities` issues a new agent identity, returns Ed25519-signed token
- `GET /identities/{id}` fetches by id
- `GET /identities` lists all
- In-memory store (SQLite swap follows in v0.0.2)
- Tests covering issue, fetch, list, signature verification

Nothing more in this commit. The point is to have a real binary that does one real thing.

## Choices Worth Recording

- **Go for the proxy.** Concurrency, standard library net/http, well-understood deployment story, single binary. The Rust daemon stays Rust because it's lower-level (filesystem, process inspection); the proxy is application-layer and Go is the right tool.
- **Ed25519 signatures.** Standard, fast, tiny tokens, post-quantum-discussion-aside it's the canonical choice for short-lived tokens.
- **Standalone module.** `proxy/` is its own Go module, doesn't depend on the daemon's Rust types. They share state through the SQLite database, not through linked code.
- **No CGO.** Use `modernc.org/sqlite` when we add SQLite, not `mattn/go-sqlite3`. Keeps the build single-binary cross-platform.
- **MCP later, not first.** v0.0.1 is HTTP. MCP server (week 9) wraps the same logic for agent-callable surface. Building HTTP first means a curl-able product on day one.

## Open Questions

- Do we ship the proxy as a sidecar, a library, or both? Sidecar is the v0 default; library exposure for embedded use comes later.
- Federation: when does agent identity need to be portable across organizations? Probably v1, not v0.
- Naming: `vigil-proxy` is fine for the binary; the marketing brand is **bevigil.ai**.
