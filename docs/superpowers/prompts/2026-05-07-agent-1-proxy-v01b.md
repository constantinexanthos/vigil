# Conductor Prompt — Agent 1: proxy v0.1.0b

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to advance the Postgres proxy from v0.1.0a (bytes-equivalent passthrough) to v0.1.0b (identity attachment + signed audit trail) by replacing the post-startup `io.Copy` relay with a single-goroutine `pgproto3` message pump.

**You are the keystone agent.** Two other agents (proxy overview tab, coalescing benchmark harness) are working in parallel on independent surfaces. Their work depends on the audit schema you ship.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec.
2. `docs/superpowers/specs/2026-05-07-three-agent-push-design.md` — this push's design, including your full scope and acceptance criteria.
3. `proxy/README.md` — current v0.1.0a state.
4. `proxy/internal/pgproxy/postgres.go` — the file you're rewriting. Read the package doc carefully — the v0.1.0a author explained why io.Copy was the right call for v0.1.0a and why a message pump is correct for v0.1.0b.
5. Commit `1885b76` (`fix(pgproxy): switch post-startup relay to io.Copy to fix SCRAM auth`) — read its diff and message. **Your code must not regress this.**

## What you ship

Replace the post-startup `io.Copy` relay with a single-goroutine `pgproto3.Backend`/`Frontend` message pump that:

1. Parses every Postgres frontend and backend message after the startup phase.
2. Attaches agent identity via the Postgres `application_name` startup parameter (format: `vigil:<base64-token>`). Verify the Ed25519 signature against the existing identity store. Look up the `agent_id`. Attach to per-connection state. **If verification fails, fall back to `agent_id=NULL` — do not reject the connection.** Observability before enforcement.
3. Writes one signed audit row per parsed message into a new `audit` table in `~/.vigil/proxy.db`.
4. Forwards every message bytes-equivalent to upstream — the existing `psql` smoke test must still pass.

## SCRAM correctness — the trap

The v0.1.0a author's note in `internal/pgproxy/postgres.go` explains the SCRAM trap: `pgproto3.Backend` needs `SetAuthType()` called between an upstream `Authentication*` message arriving and the client's matching `'p'` response, because the wire format of `'p'` (PasswordMessage vs SASLInitialResponse vs SASLResponse) is context-dependent on the most recent auth challenge.

Earlier attempts at message-level proxying broke SCRAM because the auth-type signal lives on the upstream→client side and the parser lived on the client→upstream side. **Single-goroutine** means both sides are visible to one event loop, no race. When upstream sends `AuthenticationSASL`, you call `frontend.SetAuthType(AuthTypeSASL)` before reading the next client message. **Your acceptance test #4 explicitly covers SCRAM through the proxy. It must pass.**

## Audit schema — this is a contract

Other agents are building against this schema. Do not change it without updating the spec doc.

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

Migration: detect missing table on startup, create it. Do not break existing v0.1.0a databases that lack the table.

**Signature canonical form** (sign with the existing issuer key, verify in tests):
```
agent_id|conn_id|ts|msg_type|len(query_text)|sha256(query_text)
```

## Files you own (do not modify files outside these paths)

- `proxy/internal/pgproxy/` — the message pump rewrite.
- `proxy/internal/audit/` — new package: schema migration, write API, signing.
- `proxy/internal/identity/` — additive only: a `VerifyToken(token string) (*Identity, error)` helper. Do not change existing storage layout.
- `proxy/cmd/vigil-proxy/main.go` — wire the audit writer in.
- `proxy/internal/pgproxy/*_test.go`, `proxy/internal/audit/*_test.go`, `proxy/scripts/smoke-postgres.sh` — tests.

## Files you MUST NOT touch

- `app/` — Agent 2's territory.
- `proxy/bench/` — Agent 3's territory (when they create it).
- `site/` — out of scope this push.
- `daemon/` — Rust daemon, separate concern, deferred.
- Existing identity schema/storage — additive only. Do not migrate the identity store itself.

## Acceptance criteria (all must pass in CI before you open the PR for review)

1. **Regression bar.** `scripts/smoke-postgres.sh` passes — `psql` works identically through the proxy. Same query results, same errors, same transaction behavior, same prepared-statement support.
2. **Identity attachment.** New test: `psql` connecting with `application_name=vigil:<valid-token>` lands `agent_id` populated in audit rows for every query.
3. **Identity rejection is non-fatal.** New test: `psql` with `application_name=vigil:<invalid-token>` proxies normally, audits with `agent_id=NULL`. No error to the client.
4. **SCRAM works.** New test: SCRAM-SHA-256 auth (modern Postgres default) succeeds through the proxy. This is the regression bar from commit `1885b76`.
5. **High-volume audit.** New test: 1000 sequential `SELECT 1` queries → 1000 audit rows, each with valid Ed25519 signature verified by the test.
6. **Latency budget.** Bench (Agent 3 will write `make bench`): added latency p50 < 1ms, p99 < 5ms vs direct connection. If you finish before Agent 3, write a minimal microbench in `pgproxy/bench_test.go`.

## Out of scope (do not implement)

- Rate limiting (v0.1.0c).
- Fan-out coalescing (v0.1.0d).
- Policy enforcement (v0.1.0e).
- Prepared-statement caching, TLS termination, Prometheus metrics, transparency log.

## How to know you are done

- All six acceptance tests pass in CI.
- Audit schema matches the spec exactly.
- `psql` smoke test passes locally.
- README.md updated to describe v0.1.0b state.
- PR opens against `main`, references this push spec, and the v0.1.0b roadmap entry from `2026-05-04-vigil-data-plane-design.md`.

## When you finish

Open a PR, request review from the lead agent (me). Do not merge yourself. The lead agent will:
- Review the message pump for SCRAM correctness.
- Verify audit schema matches the contract.
- Confirm Agents 2 and 3 are unblocked by your merge.

## When you get stuck

The most likely stuck point is SCRAM auth. If you cannot get SCRAM through the message pump in 4 hours of focused work, **stop and write up the failure mode**. Document what you tried, what error you saw, and where in the SCRAM exchange it broke. Open a draft PR with the writeup and ping the lead agent. Do not silently regress to `io.Copy` — that's what v0.1.0a already did.
