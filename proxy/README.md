# vigil-proxy

The agent-aware data plane for Vigil. A Go-based proxy that sits between AI agents and the systems they touch (databases, APIs, services) and shapes traffic the way agent traffic actually behaves: per-agent identity, rate limiting, fan-out coalescing, policy enforcement, signed audit trail.

Part of [bevigil.ai](https://bevigil.ai).

## Install

```bash
brew install constantinexanthos/vigil/vigil
vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432
```

`brew install` lands two binaries on PATH:

| Binary       | Role                                                          |
| ------------ | ------------------------------------------------------------- |
| `vigil-proxy` | The data plane. Listens for Postgres clients, forwards upstream. |
| `vigil-run`  | Subprocess wrapper. Mints + injects identity for any agent.    |

Both are single static binaries, no runtime dependencies. State (identity store + audit DB) lands in `~/.vigil/` on first run.

### From source

```bash
go install github.com/constantinexanthos/vigil/proxy/cmd/vigil-proxy@latest
go install github.com/constantinexanthos/vigil/proxy/cmd/vigil-run@latest
```

### Linux (without Homebrew)

Download both binaries for your architecture from the [GitHub Releases](https://github.com/constantinexanthos/vigil/releases) page, `chmod +x`, drop them on PATH.

## Identity

Vigil ships a three-tier identity model. Pick the one that matches how much setup you can tolerate:

| Tier | What you do | What you get |
| --- | --- | --- |
| **Tier 1** — inferred (v0.1.0e+) | Nothing. Point your agent at port 7432. | Per-harness rate-limit pools + audit-row tagging from process introspection. |
| **Tier 2** — declared via wrapper | `vigil-run claude` (or any command) | Signed Ed25519 identity, cached in OS keychain, injected as `VIGIL_TOKEN` env var. Audit rows + rate limits attributed to your specific `principal`+`agent_name`. |
| **Tier 3** — declared via library | Import `vigil.WrapPgxConfig` / `wrap_psycopg` / `wrapPg` in your code | Same as Tier 2, attached inline. Useful when wrapping the parent binary isn't an option (Cursor extensions, custom bots). |

Per-harness instructions live in `proxy/docs/harnesses/`:

- [Claude Code](docs/harnesses/claude-code.md)
- [OpenAI Codex CLI](docs/harnesses/codex.md)
- [Cursor](docs/harnesses/cursor.md)
- [VS Code](docs/harnesses/vscode.md)
- [Conductor](docs/harnesses/conductor.md)
- [Custom agents](docs/harnesses/custom.md)

Helper packages (in-tree, not yet on package registries):

- Go: `proxy/clients/go/vigil/`
- Python (PyPI: `vigil-client`): `proxy/clients/python/vigil/`
- Node (npm: `@vigil/client`): `proxy/clients/node/vigil/`

> **Note on Tier 1**: process introspection ships in v0.1.0e (Sub-project B). Until that lands, point your agent at the proxy and traffic shows up as anonymous in the audit feed — Tier 2 / Tier 3 are the paths to per-agent attribution today.

## Status

**v0.1.0c** — Per-agent token-bucket rate limiting. The proxy now classifies each client-originated Postgres frame into one of three pools (`production` / `agents` / `unauth`) and consumes a token before forwarding it upstream. When the bucket is empty the call blocks until refill, then forwards anyway — back-pressure, not rejection. The decision (`allowed` vs `rate_limited`) is written on every audit row so the dashboard can distinguish straight-through traffic from throttled traffic. See `internal/ratelimit/` for the implementation; `--ratelimit-config <path>` accepts a YAML to tune pools and add per-agent overrides.

**v0.1.0b** — Identity attachment + signed audit trail. The post-startup `io.Copy` relay from v0.1.0a is replaced with a single-goroutine `pgproto3.Backend`/`Frontend` message pump that parses every Postgres frontend and backend message, attaches per-connection agent identity (via `application_name=vigil:<base64-token>`), and writes one signed Ed25519 audit row per parsed message into a new `audit` table in `~/.vigil/proxy.db`.

Identity attachment is observability-only — invalid tokens fall back to `agent_id=NULL` rather than rejecting the connection. Forwarding stays bytes-equivalent: the existing `psql` smoke test passes unchanged, and SCRAM-SHA-256 (modern Postgres default) negotiates correctly through the message pump because the single-goroutine design lets the parser see the upstream `Authentication*` challenge and call `frontend.SetAuthType()` before reading the client's matching `'p'` response.

The startup phase (SSL/GSS decline, StartupMessage forwarding) is still parsed in-band so we can negotiate plaintext. See the package doc on `internal/pgproxy/postgres.go` for the message-pump rationale and the SCRAM trap.

v0.1.0d adds fan-out coalescing and an MCP server for agent self-introspection.

### v0.1.0d coalescing

`proxy/internal/coalesce` implements the per-agent query result cache that backs the website's "40–80% cost reduction" claim. It satisfies `pgproxy.Coalescer` and is wired into the `relay()` loop's client-frame branch: on a simple-protocol `Query` outside an explicit transaction, the proxy consults the cache before forwarding. On hit, the cached upstream response is replayed to the client byte-for-byte and the round-trip to Postgres is skipped entirely. On miss, the response is captured frame-by-frame until `ReadyForQuery` and stored under the same key for the next caller.

**Measured against the bench's refactor preset: 99.22% dedup** (62,164 client queries → 484 upstream queries). The bar in the design doc was ≥40%. Production-shape traffic (wide key universe) measures at 12% — the design's promise that "production runs untouched" holds.

Properties:

- **Per-agent isolation.** Anonymous traffic (`agent_id=""`) never coalesces — different agents have different RLS context, search paths, role memberships, so cached responses are not interchangeable.
- **Cache key.** Canonicalized query text + bind params + database + role. No lowercasing (Postgres treats `"User"` ≠ `"user"`), no comment stripping (a planner hint changes plan).
- **Deny list.** `nextval/setval/currval`, `random/gen_random_uuid`, time-sensitive funcs (`now()`, `current_timestamp`, …), context-sensitive (`current_user`, …), advisory locks, xact metadata, `FOR UPDATE/SHARE/NO KEY UPDATE`, multi-statement.
- **TTL.** 250ms default (`--coalesce-ttl <duration>`). Lazy expiry on Lookup.
- **Bound.** Per-agent LRU, 1000 entries. Per-response cap 256KB.
- **Volatile.** No persistence — cache is rebuilt on restart.

CLI:

```bash
vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432 --coalesce-ttl 250ms
```

See [docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md](../docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md) for the full design.

### v0.1.0d MCP server

`proxy/internal/mcpserver` exposes Vigil's identity + audit primitives as JSON-RPC 2.0 tools over stdio, so coding agents (Claude Code, Cursor, Codex) can introspect themselves through their existing MCP host. Same binary, different mode: `vigil-proxy --mcp-stdio` skips the HTTP and Postgres listeners and speaks Content-Length-framed JSON-RPC on stdin/stdout. Logs redirect to stderr because stdout is reserved for the wire format.

Two tools ship in v0.1.0d:

| Tool | Purpose |
|---|---|
| `vigil.identity.whoami` | Returns the calling agent's identity, principal, scopes, and expiration. `agent_id: null` if the caller is anonymous (no token configured yet) — the discovery flow stays usable before auth is wired. |
| `vigil.activity.query` | Reads the calling agent's audit rows, scoped to `agent_id`. Anonymous callers see an empty result, never another agent's traffic. Supports `since` (RFC3339), `limit` (default 50, max 1000), and `msg_type` filters. |

Auth model (per the May 7 three-agent design):

1. `clientInfo.vigil_token` in the `initialize` params — primary, MCP host passes it through.
2. `VIGIL_TOKEN` env var — fallback for hosts that don't propagate clientInfo extras.
3. Neither — anonymous; whoami still returns 200 with `agent_id: null`.

Install in `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "vigil": {
      "command": "/path/to/vigil-proxy",
      "args": ["--mcp-stdio"],
      "env": { "VIGIL_TOKEN": "<token-from-POST-/identities>" }
    }
  }
}
```

The MCP host spawns one subprocess per session; the server exits cleanly on stdin EOF.

## Persistence

State lives in `~/.vigil/` so a single backup covers everything Vigil-related:

| File | Purpose |
|---|---|
| `~/.vigil/proxy.db` | SQLite identity store + `audit` table (created on first start; WAL mode for concurrent reads) |
| `~/.vigil/proxy.key` | Ed25519 issuer private key, mode 0600 (generated on first start). Same key signs identities and audit rows. |

Override with flags or env vars:

| Flag | Env var | Default | Purpose |
|---|---|---|---|
| `--addr <addr>` | `VIGIL_PROXY_ADDR` | `:7878` | HTTP listen address (identity API + healthz) |
| `--db <path>` | `VIGIL_PROXY_DB` | `~/.vigil/proxy.db` | SQLite identity store |
| `--key <path>` | `VIGIL_PROXY_KEY` | `~/.vigil/proxy.key` | Ed25519 issuer key |
| `--postgres-listen <addr>` | `VIGIL_POSTGRES_LISTEN` | _(empty, disabled)_ | Where Vigil listens for Postgres clients (e.g. `:7432`) |
| `--postgres-upstream <addr>` | `VIGIL_POSTGRES_UPSTREAM` | _(empty, disabled)_ | Real Postgres address to forward to (e.g. `localhost:5432`) |
| `--postgres-disabled` | `VIGIL_POSTGRES_DISABLED` | `false` | Convenience flag to disable the Postgres proxy without unsetting listen/upstream |
| `--ratelimit-config <path>` | `VIGIL_RATELIMIT_CONFIG` | _(empty, use defaults)_ | Path to a YAML rate-limit config. Bad YAML is fatal — startup exits 1 rather than silently falling back. |
| `--coalesce-ttl <duration>` | `VIGIL_COALESCE_TTL` | `250ms` | Per-entry TTL for the fan-out coalescing cache. |
| `--mcp-stdio` | `VIGIL_MCP_STDIO` | `false` | Run as an MCP stdio server (skips HTTP/Postgres listeners; logs redirect to stderr). Mutually exclusive with the HTTP and Postgres modes. |

The Postgres proxy starts only when both `--postgres-listen` and `--postgres-upstream` are set and `--postgres-disabled` is not.

### Rate limiting (v0.1.0c)

Three pools ship by default. Without `--ratelimit-config`, every identified agent lands in `agents` and every anonymous client lands in `unauth`. The token bucket is per `(agent_id, pool)`; an empty `agents` pool only blocks one agent, not the rest. The shipped defaults:

| Pool | Burst | Refill (tokens/sec) | Purpose |
|---|---|---|---|
| `production` | 1000 | 500 | Real human/web traffic. Insulated from agent abuse via explicit per-agent mapping. |
| `agents` | 1000 | 500 | Identified agents. Generous enough that ordinary refactor flows never feel a throttle; the bucket is here to stop a runaway loop, not to police normal use. |
| `unauth` | 10 | 5 | Anonymous traffic. Defense against rogue clients. |

The agents default matches production for v0.1.0d (was 100/50 in v0.1.0c). Most coding agents fan out enough query traffic that the lower bucket was throttling ordinary work; operators who want the v0.1.0c shape back can keep it explicit in `--ratelimit-config`.

Override or extend via `--ratelimit-config`:

```yaml
pools:
  production: { burst: 1000, refill: 500 }
  agents:     { burst: 1000, refill: 500 }
  unauth:     { burst: 10,   refill: 5 }

agents:
  ag_3J9XX: { pool: production }            # promote this agent into the production pool
  ag_AB2YY: { burst: 2000, refill: 1000 }   # custom bucket for this agent specifically
```

Acquire returns one of two outcomes (recorded on the audit row):

- `allowed` — token was available immediately; the message flowed through normally.
- `rate_limited` — the call waited for refill before being admitted. The message still completes; this is back-pressure, not rejection. v1 never rejects.

A long idle period does not let the bucket overfill — refills are clamped to `burst`. Per-agent state lives in-memory only; restarting vigil-proxy clears all buckets.

The SQLite driver is `modernc.org/sqlite` — pure Go, no CGO, so cross-compiling for distribution is trivial. Timestamps are stored as RFC3339 strings (not SQLite's native `datetime()`) to keep range queries lex-correct.

## Quick start

Identity-only (default behavior, no Postgres proxy):

```bash
cd proxy
go run ./cmd/vigil-proxy
```

Issue an identity:

```bash
curl -X POST http://localhost:7878/identities \
  -H 'content-type: application/json' \
  -d '{"agent_name":"claude-code","principal":"costa@example.com","scopes":["read","write"]}'
```

Start with the Postgres proxy enabled:

```bash
go run ./cmd/vigil-proxy \
  --postgres-listen :7432 \
  --postgres-upstream localhost:5432
```

Connect through it identically to direct Postgres:

```bash
PGPASSWORD=test psql -h localhost -p 7432 -U postgres -c 'SELECT 1, version()'
```

## Smoke test

End-to-end check against a real Postgres (Docker spin-up commented in the script):

```bash
./scripts/smoke-postgres.sh
```

Builds vigil-proxy, starts it pointed at `localhost:5432`, runs a real `psql` query through it, asserts exit 0, tears down. Does not commit anything; pure local verification.

## Build

```bash
go build -o bin/vigil-proxy ./cmd/vigil-proxy
```

## Test

```bash
go test ./...
```

## Architecture

| Package | Purpose |
|---|---|
| `cmd/vigil-proxy` | Binary entry point |
| `internal/config` | Configuration loading |
| `internal/identity` | Agent identity issuer (Ed25519) |
| `internal/pgproxy` | Postgres wire-protocol proxy (single-goroutine pgproto3 pump) |
| `internal/audit` | Signed audit trail (SQLite + Ed25519) |
| `internal/ratelimit` | Per-agent token-bucket rate limiter (v0.1.0c) |
| `internal/proxy` | (future) protocol-agnostic proxy dispatcher |
| `internal/coalesce` | Per-agent query result cache (v0.1.0d — wired into pgproxy relay) |
| `internal/mcpserver` | MCP stdio server: `vigil.identity.whoami` + `vigil.activity.query` (v0.1.0d) |
| `internal/policy` | (future) rule engine |

## License

MIT (see repository root).
