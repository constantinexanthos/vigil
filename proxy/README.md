# vigil-proxy

The agent-aware data plane for Vigil. A Go-based proxy that sits between AI agents and the systems they touch (databases, APIs, services) and shapes traffic the way agent traffic actually behaves: per-agent identity, rate limiting, fan-out coalescing, policy enforcement, signed audit trail.

Part of [bevigil.ai](https://bevigil.ai).

## Status

**v0.1.0a** — Bytes-equivalent Postgres wire-protocol passthrough. Vigil sits between a Postgres client and the upstream server and forwards every byte unmodified. `psql` through the proxy behaves identically to direct connection. The HTTP identity issuer from v0.0.2 still runs unconditionally; the Postgres proxy starts when `--postgres-listen` and `--postgres-upstream` are set.

The startup phase (SSL/GSS decline, StartupMessage forwarding) is parsed in-band so we can negotiate plaintext. Everything after that runs as raw byte forwarding — see the package doc on `internal/pgproxy/postgres.go` for why message-level proxying is deferred to v0.1.0b.

This is the wire-layer foundation. v0.1.0b layers identity attachment and audit; v0.1.0c adds rate shaping; v0.1.0d adds fan-out coalescing.

See [docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md](../docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md) for the full design.

## Persistence

State lives in `~/.vigil/` next to the daemon's `vigil.db` so a single backup covers everything Vigil-related:

| File | Purpose |
|---|---|
| `~/.vigil/proxy.db` | SQLite identity store (created on first start) |
| `~/.vigil/proxy.key` | Ed25519 issuer private key, mode 0600 (generated on first start) |

Override with flags or env vars:

| Flag | Env var | Default | Purpose |
|---|---|---|---|
| `--addr <addr>` | `VIGIL_PROXY_ADDR` | `:7878` | HTTP listen address (identity API + healthz) |
| `--db <path>` | `VIGIL_PROXY_DB` | `~/.vigil/proxy.db` | SQLite identity store |
| `--key <path>` | `VIGIL_PROXY_KEY` | `~/.vigil/proxy.key` | Ed25519 issuer key |
| `--postgres-listen <addr>` | `VIGIL_POSTGRES_LISTEN` | _(empty, disabled)_ | Where Vigil listens for Postgres clients (e.g. `:7432`) |
| `--postgres-upstream <addr>` | `VIGIL_POSTGRES_UPSTREAM` | _(empty, disabled)_ | Real Postgres address to forward to (e.g. `localhost:5432`) |
| `--postgres-disabled` | `VIGIL_POSTGRES_DISABLED` | `false` | Convenience flag to disable the Postgres proxy without unsetting listen/upstream |

The Postgres proxy starts only when both `--postgres-listen` and `--postgres-upstream` are set and `--postgres-disabled` is not.

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
| `internal/pgproxy` | Postgres wire-protocol proxy (v0.1.0a passthrough) |
| `internal/proxy` | (future) protocol-agnostic proxy dispatcher |
| `internal/ratelimit` | (future) per-agent token-bucket |
| `internal/coalesce` | (future) query deduplication |
| `internal/policy` | (future) rule engine |
| `internal/audit` | (future) signed audit trail |
| `internal/mcp` | (future) MCP server for agent introspection |

## License

MIT (see repository root).
