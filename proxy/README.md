# vigil-proxy

The agent-aware data plane for Vigil. A Go-based proxy that sits between AI agents and the systems they touch (databases, APIs, services) and shapes traffic the way agent traffic actually behaves: per-agent identity, rate limiting, fan-out coalescing, policy enforcement, signed audit trail.

Part of [bevigil.ai](https://bevigil.ai).

## Status

**v0.0.2** — Identity issuer with persistent state. HTTP server that issues, fetches, and lists Ed25519-signed agent identities. SQLite-backed store; on-disk Ed25519 keypair so previously-issued tokens stay verifiable across restarts.

See [docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md](../docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md) for the full design.

## Persistence

State lives in `~/.vigil/` next to the daemon's `vigil.db` so a single backup covers everything Vigil-related:

| File | Purpose |
|---|---|
| `~/.vigil/proxy.db` | SQLite identity store (created on first start) |
| `~/.vigil/proxy.key` | Ed25519 issuer private key, mode 0600 (generated on first start) |

Override with flags or env vars:

| Flag | Env var | Default |
|---|---|---|
| `--db <path>` | `VIGIL_PROXY_DB` | `~/.vigil/proxy.db` |
| `--key <path>` | `VIGIL_PROXY_KEY` | `~/.vigil/proxy.key` |
| `--addr <addr>` | `VIGIL_PROXY_ADDR` | `:7878` |

The SQLite driver is `modernc.org/sqlite` — pure Go, no CGO, so cross-compiling for distribution is trivial. Timestamps are stored as RFC3339 strings (not SQLite's native `datetime()`) to keep range queries lex-correct.

## Quick start

```bash
cd proxy
go run ./cmd/vigil-proxy
```

In another terminal:

```bash
# Issue an identity for Claude Code
curl -X POST http://localhost:7878/identities \
  -H 'content-type: application/json' \
  -d '{"agent_name":"claude-code","principal":"costa@example.com","scopes":["read","write"]}'

# List identities
curl http://localhost:7878/identities

# Fetch by id
curl http://localhost:7878/identities/{id}
```

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
| `internal/proxy` | (future) database/API proxy core |
| `internal/ratelimit` | (future) per-agent token-bucket |
| `internal/coalesce` | (future) query deduplication |
| `internal/policy` | (future) rule engine |
| `internal/audit` | (future) signed audit trail |
| `internal/mcp` | (future) MCP server for agent introspection |

## License

MIT (see repository root).
