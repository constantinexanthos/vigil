# vigil-proxy

The agent-aware data plane for Vigil. A Go-based proxy that sits between AI agents and the systems they touch (databases, APIs, services) and shapes traffic the way agent traffic actually behaves: per-agent identity, rate limiting, fan-out coalescing, policy enforcement, signed audit trail.

Part of [bevigil.ai](https://bevigil.ai).

## Status

**v0.0.1** — Identity issuer only. HTTP server that issues, fetches, and lists Ed25519-signed agent identities. In-memory store.

See [docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md](../docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md) for the full design.

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
