# Vigil MCP Server — Design

**Date:** 2026-05-07
**Status:** Draft v0 (creative track from three-agent push)
**Owner:** Costa (drafted by Claude as lead agent)
**Related:**
- `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — week 9 of the canonical roadmap is "MCP Server"; this pulls it forward to week 6
- `docs/superpowers/specs/2026-05-07-three-agent-push-design.md` — this is the lead agent's creative track from that push

---

## Why pull MCP forward

The canonical spec slates an MCP server for week 9. There are three reasons to pull it forward:

1. **Dogfood story.** Vigil's pitch is "agent-aware data plane." If Vigil itself is the most agent-aware tool — meaning the agents using Vigil can query Vigil — that's the strongest possible demonstration of the thesis.
2. **Viral install vector.** Cursor, Claude Code, and Codex all consume MCP servers natively. The first time a developer asks Claude Code "what scope am I in?" and Claude Code calls `vigil.identity.whoami` and gets back "you're claude-code with read+write on src/, you've made 47 queries today, you've been rate-limited 0 times" — that's the moment Vigil stops being a config-file proxy and starts being infrastructure agents talk to.
3. **It changes the demo.** Without MCP, Vigil's demo is "look at this dashboard." With MCP, Vigil's demo is "I asked Claude Code to refactor this file, and Claude Code said 'I want to drop a column from production — Vigil says my agent_id needs human approval for DROP, want me to ask?'" That's the venture pitch in one sentence.

## Goal

Expose Vigil's primitives — identity issuance, identity introspection, activity query, policy check — as an MCP server. Coding agents (Cursor, Claude Code, Codex, custom) can install Vigil as an MCP server and introspect their own scope, audit trail, and policy decisions.

The MCP server runs in the same `vigil-proxy` binary, on a separate transport (stdio or HTTP). It reads from the same SQLite store as the existing HTTP identity API and the v0.1.0b audit table.

## Non-Goals

- Replace the HTTP identity API. The HTTP API stays for human/CI use; MCP is for agents.
- Be the first MCP server to do agent identity — we integrate with whatever the ecosystem standardizes on (Microsoft Entra Agent ID, Anthropic agent auth) when they ship.
- Expose write operations beyond identity issuance. v0 is read-mostly; agents can introspect, not configure.
- Replace policy enforcement at the proxy layer. Policy lives at the proxy, not in MCP responses. MCP `policy.check` is advisory.

## Architecture

```
┌──────────────────┐         ┌─────────────────────┐
│   Coding agent   │──MCP───►│    vigil-proxy      │
│ (Claude Code etc)│         │                     │
└──────────────────┘         │ ┌─────────────────┐ │
                             │ │   MCP server    │ │
┌──────────────────┐         │ │  (this work)    │ │
│   Postgres       │◄───────►│ ├─────────────────┤ │
│   client (psql)  │         │ │   pgproxy       │ │
└──────────────────┘         │ ├─────────────────┤ │
                             │ │  identity       │ │
┌──────────────────┐         │ │  audit (v01b)   │ │
│  Human (HTTP)    │──HTTP──►│ │  HTTP API       │ │
│  curl, dashboard │         │ └─────────────────┘ │
└──────────────────┘         └─────────────────────┘
                                       │
                                       ▼
                             ~/.vigil/proxy.db
```

One binary. Three transports (Postgres wire, HTTP, MCP). One SQLite store backing all three.

## MCP transport

- **Default: stdio.** Matches Claude Code's and Cursor's existing MCP install convention. Server process spawned by the agent's MCP host, communicates via stdin/stdout JSON-RPC.
- **Optional: HTTP+SSE.** For remote MCP scenarios (e.g., a hosted Vigil instance serving a fleet of agents). Behind a flag (`--mcp-http :7879`). Not first-class for v0.

## Tools exposed

All tools require the calling agent to authenticate via an issued Vigil identity. The identity is passed via MCP `initialize` request's `clientInfo.token` field (or equivalent — see "Auth model" below).

### `vigil.identity.whoami`

Returns the calling agent's identity, principal, scopes, expiration.

**Input:** none.
**Output:**
```json
{
  "agent_id": "ag_3J9...",
  "agent_name": "claude-code",
  "principal": "costa@example.com",
  "scopes": ["read", "write"],
  "expires_at": "2026-05-08T22:00:00Z"
}
```

**Error cases:** unauthenticated → `-32001 Unauthorized`. No identity attached → return `null`-ish payload with `agent_id: null` rather than erroring (don't break agents that are still configuring).

### `vigil.identity.list`

Lists all identities the caller is allowed to see. v0: requires admin scope. v1: every agent can list its own org's identities.

**Input:** `{ "limit": int, "cursor": string|null }`
**Output:** `{ "identities": [Identity], "next_cursor": string|null }`
**Error cases:** missing admin scope → `-32002 Forbidden`.

### `vigil.identity.issue`

Issues a new identity. Admin-only in v0; this is the same operation as the HTTP `POST /identities` endpoint, exposed for agentic provisioning workflows.

**Input:** `{ "agent_name": string, "principal": string, "scopes": [string] }`
**Output:** `Identity` (including the signed token to embed in `application_name`).
**Error cases:** missing admin scope, duplicate name, etc.

### `vigil.activity.query`

Query the audit log. By default, returns the calling agent's own activity. Admins can query any agent.

**Input:** `{ "agent_id": string|null, "since": iso8601|null, "limit": int, "msg_type": string|null }`
**Output:** `{ "rows": [AuditRow], "summary": { "total": int, "by_type": {...} } }`
**Error cases:** querying another agent without admin scope → `-32002 Forbidden`.

### `vigil.policy.check`

Given a candidate request (route, action, target), return whether the calling agent would be allowed.

**Input:** `{ "backend": "postgres", "action": "SELECT|UPDATE|DELETE|...", "target": "schema.table" }`
**Output:** `{ "verdict": "allow|deny|require_approval", "reason": string, "policy_id": string|null }`
**Error cases:** unknown backend → `-32001`.

In v0, this is **advisory** — the actual enforcement happens at the proxy. v0's policy engine is empty (returns `allow` for everything), so this method returns `{verdict: "allow", reason: "no policies configured"}` until v0.1.0e. Shipping the surface now lets agents code against the contract.

## Auth model

The hard question: how does the MCP server know which agent is calling it?

**Option A — Token in `clientInfo`.** MCP's `initialize` request carries `clientInfo` (free-form). Vigil expects `clientInfo.vigil_token` to be a Vigil-issued token. Server verifies signature, attaches identity to session, all subsequent tool calls are authenticated.

**Option B — Token via env var.** The MCP host (Claude Code) launches the server process with `VIGIL_TOKEN=<token>` in the env. Server reads it, verifies, attaches identity. Simpler, but couples MCP host config to Vigil.

**Option C — Per-call token.** Every tool call carries the token in arguments. Most flexible but pollutes every API.

**Recommendation: Option A with Option B fallback.** `clientInfo.vigil_token` first; if absent, `VIGIL_TOKEN` env var; if both absent, mark identity as `null` and allow read-only no-identity introspection (so an agent that just installed Vigil can call `whoami` and learn it needs to configure a token).

## Failure modes and observability

- **Token expired.** Return `-32003 TokenExpired`. Agents should re-issue.
- **Token revoked.** Same as expired in v0; revocation list is a v1 feature.
- **DB unavailable.** Return `-32000 InternalError` with a stable error code. The MCP server should not panic.
- **High call volume.** Per-agent rate-limit MCP calls separately from data-plane calls. v0: 10 calls/sec/agent.
- **Audit MCP calls.** Every tool call lands in the `audit` table with `direction='mcp'`, `msg_type='Tool/<name>'`. The same audit row format as Postgres queries — single source of truth for "what did this agent do."

## Build sequence

This is a future push, not part of the current three-agent week. Listed here so the design is concrete when we get to it.

| Sub-task | Owns |
|---|---|
| 1. MCP stdio scaffold | `proxy/internal/mcpserver/transport_stdio.go`, JSON-RPC plumbing |
| 2. Auth + session | `proxy/internal/mcpserver/auth.go`, integrates with identity package |
| 3. Tool registry | `proxy/internal/mcpserver/tools/`, one file per tool |
| 4. `whoami`, `list`, `issue` | wraps existing identity operations |
| 5. `activity.query` | reads audit table from v0.1.0b |
| 6. `policy.check` | placeholder until v0.1.0e |
| 7. Optional HTTP+SSE transport | `proxy/internal/mcpserver/transport_http.go` |
| 8. Documentation: install in Claude Code, Cursor | `docs/mcp/` |

## Acceptance (when this push happens)

1. **Stdio install in Claude Code.** Add `vigil` to `~/.claude/mcp.json`. Restart Claude Code. Run `/mcp` — see `vigil` listed with healthy status.
2. **End-to-end whoami.** Ask Claude Code "use vigil to tell me my agent identity." Get back the configured identity.
3. **Audit visibility.** Run `vigil.activity.query` from inside Claude Code. See the `whoami` and `query` calls themselves in the audit log.
4. **Policy advisory.** Run `vigil.policy.check` for a SELECT against the audit table. Get `{verdict: "allow"}` (v0).
5. **Cursor + Codex.** Same `whoami` works from Cursor and Codex (or whichever agents support MCP at that time).

## Why this is venture-grade (continued from main push spec)

The benchmark proves the value. The MCP server makes the value **call itself**. When Cursor calls `vigil.policy.check` before issuing a destructive query, that's not a feature — that's a primitive. Primitives compound. The first time a developer's agent surfaces a Vigil-mediated policy decision in their chat window, Vigil is no longer one of N tools they could install — it's the substrate their agent runs on.

The pricing implication: the OSS proxy is the floor. The hosted control plane that issues identities, manages policies, and stores audit history with retention SLAs is the ceiling. MCP is the bridge — agents that install the OSS proxy organically pull their owners toward the hosted plane the moment they need cross-machine policy or compliance retention.

## Open questions

- **Token rotation.** How often, by what process? Probably out-of-band (HTTP API), not in the agent's flow.
- **Multi-tenant.** When Vigil hosts multiple orgs (v1), how does the MCP server scope an identity to its org? Probably via the issuer key — every org has its own issuer, MCP servers are bound to one issuer at install time.
- **Revocation semantics.** Soft-delete + revocation list, or hard-delete + token TTL? Probably the former for audit reasons.
- **Streaming responses.** Should `activity.query` stream results for large windows? MCP supports streaming via SSE — natural fit, but adds complexity. v1.

---
