# Conductor Prompt — Agent: MCP Server Prototype

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to ship the first working MCP server inside the `vigil-proxy` binary so coding agents (Claude Code, Cursor, Codex) can introspect their own identity and activity by calling Vigil over stdio.

This is the **dogfood story**. Vigil's pitch is "agent-aware data plane." If the agents using Vigil can ASK Vigil what they have access to and what they've done, that's the strongest possible demonstration of the thesis. First time a developer asks Claude Code "what's my Vigil scope?" and Claude Code calls `vigil.identity.whoami` and gets a real answer is the moment Vigil stops being a config-file proxy and starts being substrate.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-07-mcp-server-design.md` — full design for this work. Read every section. The auth model, tool schemas, and "Why pull MCP forward" arguments are all there.
2. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec. Section 6 names MCP as week 9; this PR pulls it forward.
3. `proxy/internal/identity/identity.go` — the existing identity issuer. You'll call `Issuer.Verify(rawToken)` to authenticate MCP callers.
4. `proxy/internal/audit/audit.go` — the audit schema. `vigil.activity.query` reads from this table.
5. `proxy/cmd/vigil-proxy/main.go` — where you'll wire a new `--mcp-stdio` flag.
6. The MCP protocol spec — JSON-RPC 2.0 over stdio with `initialize`, `tools/list`, `tools/call`. If unfamiliar, read https://spec.modelcontextprotocol.io/ before starting.

## What you ship

A `proxy/internal/mcpserver/` package + a `--mcp-stdio` flag on `vigil-proxy`. When the flag is set, the binary runs as a stdio MCP server (instead of, or alongside, the HTTP/Postgres proxies).

Two tools in v0:

### `vigil.identity.whoami`
**Input:** none.
**Output:**
```json
{
  "agent_id": "ag_3J9...",
  "agent_name": "claude-code",
  "principal": "costa@example.com",
  "scopes": ["read", "write"],
  "expires_at": "2026-05-16T22:00:00Z"
}
```
If the calling client has no token attached, return `{ "agent_id": null }` — don't error. Agents that just installed Vigil need to discover this tool works before they configure auth.

### `vigil.activity.query`
**Input:**
```json
{
  "since": "2026-05-15T00:00:00Z",  // optional, default 1h ago
  "limit": 50,                        // default 50, max 500
  "msg_type": "Query"                // optional filter
}
```
**Output:**
```json
{
  "rows": [
    { "ts": "...", "msg_type": "Query", "query_text": "SELECT 1", "decision": "allowed", "bytes": 14 }
  ],
  "summary": { "total": 1, "by_decision": {"allowed": 1} }
}
```
Scoped to the calling agent's `agent_id`. Anonymous callers see nothing.

## Auth model

Per the May 7 spec:

1. **Primary:** MCP `initialize` request's `clientInfo.vigil_token` (free-form field per spec).
2. **Fallback:** `VIGIL_TOKEN` env var on the server process.
3. **No token:** caller is anonymous. `whoami` returns `{agent_id: null}`. `activity.query` returns empty rows.

Verify tokens with the existing `identity.Issuer.Verify(rawToken)` call. The audit DB used for `activity.query` is the same `~/.vigil/proxy.db` the proxy writes to.

## Files you own

- `proxy/internal/mcpserver/` — new package:
  - `transport_stdio.go` — JSON-RPC 2.0 read/write over stdin/stdout
  - `auth.go` — token extraction from `initialize` + env fallback
  - `tools.go` — tool registry, dispatch
  - `tools/whoami.go`, `tools/activity_query.go` — the two implementations
  - `*_test.go` — tests
- `proxy/cmd/vigil-proxy/main.go` — additive: add `--mcp-stdio` flag. When set, run the MCP server (and skip the HTTP/Postgres listeners). When unset, current behavior unchanged.
- `proxy/README.md` — add an "MCP" section with the install snippet for `~/.claude/mcp.json`.

## Files you MUST NOT touch

- `proxy/internal/pgproxy/` — out of scope for MCP work.
- `proxy/internal/audit/` — read-only consumer.
- `proxy/internal/identity/` — read-only consumer.
- `proxy/internal/ratelimit/`, `proxy/internal/coalesce/` — sibling agents own these.
- `app/`, `daemon/`, `site/` — out of scope.

## Heads up — concurrent agents touching `main.go`

Three other agents on this push are also adding flags + wiring to `proxy/cmd/vigil-proxy/main.go` (`--ratelimit-config`, `--coalesce-ttl`, etc.). Adjacent-line conflicts are likely. Keep your additions in a clearly delimited block (e.g., comment `// MCP server` above your flag + instantiation), and rebase cleanly when other PRs land. The lead reviewer will help reconcile.

## Acceptance criteria (all must pass in CI before opening PR)

1. **Stdio JSON-RPC roundtrip.** Start the server, send `initialize` followed by `tools/list`, get back the two tools. Test via subprocess + pipe in a Go test.
2. **whoami with valid token.** Pass a token in `clientInfo.vigil_token`, call `tools/call vigil.identity.whoami`, get the right identity back.
3. **whoami with no token.** Same call without a token returns `{agent_id: null}` and 200, not an error.
4. **whoami with invalid token.** Returns `{agent_id: null}` (treat as anonymous, don't error). The agent installer needs the tool to "work" before they fix auth.
5. **activity.query scope.** Calling agent A sees only agent A's audit rows. Anonymous callers see empty list.
6. **activity.query filters.** `since` and `msg_type` parameters narrow the result correctly.
7. **End-to-end with Claude Code.** Add a config to `~/.claude/mcp.json` pointing at `vigil-proxy --mcp-stdio`. In Claude Code, run `/mcp` — see Vigil listed healthy. Ask Claude "use vigil to tell me my identity" — get a real response. (This last bit is manual; document the steps you used in the PR body, no CI test needed.)
8. **Existing `vigil-proxy` modes still work.** When `--mcp-stdio` is not set, the HTTP identity API + Postgres proxy still start as before. Regression bar.

## Out of scope (do not implement)

- `vigil.identity.list` and `vigil.identity.issue` (admin tools, deferred to a future push).
- `vigil.policy.check` (policy engine doesn't exist yet — that's v0.1.0e).
- HTTP+SSE transport (deferred per the May 7 spec; stdio only for v1).
- Token rotation, revocation, multi-tenant scoping — all deferred.
- Streaming responses for large activity queries.

## How to know you are done

- All 8 acceptance tests pass (#7 is a manual, documented run).
- A copy-paste snippet in `proxy/README.md` shows the exact `~/.claude/mcp.json` config to install Vigil as an MCP server.
- A 30-second screen recording (or asciinema cast) showing: configure mcp.json → restart Claude Code → `/mcp` shows vigil → ask "what's my Vigil identity" → real response. Attach to PR.

## When you finish

Open a PR against `main`, request review from the lead agent. Do not merge yourself. The lead will:
- Test the install end-to-end in their own Claude Code.
- Verify the auth fallback chain (token → env → anonymous).
- Reconcile any main.go conflicts with the other agents' PRs.

## When you get stuck

The most likely stuck point is the JSON-RPC framing over stdio. The MCP spec uses Content-Length headers (HTTP-style) for message boundaries. If the framing isn't obvious, look at how `mcp-go` or the official Anthropic MCP SDK handles it — both are open source. **Don't reinvent JSON-RPC framing**; either use a small library or copy the framing pattern verbatim with attribution in a comment.

If you cannot get Claude Code to detect the server (acceptance #7), file a draft PR with the wire trace logged from the server's stdin. The lead will help diagnose.
