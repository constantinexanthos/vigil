# vigil-proxy

The agent-aware data plane for Vigil. A Go-based proxy that sits between AI agents and the systems they touch (databases, APIs, services) and shapes traffic the way agent traffic actually behaves: per-agent identity, rate limiting, fan-out coalescing, policy enforcement, signed audit trail.

Part of [bevigil.ai](https://bevigil.ai).

## Status

**v0.1.0c** — Per-agent token-bucket rate limiting. The proxy now classifies each client-originated Postgres frame into one of three pools (`production` / `agents` / `unauth`) and consumes a token before forwarding it upstream. When the bucket is empty the call blocks until refill, then forwards anyway — back-pressure, not rejection. The decision (`allowed` vs `rate_limited`) is written on every audit row so the dashboard can distinguish straight-through traffic from throttled traffic. See `internal/ratelimit/` for the implementation; `--ratelimit-config <path>` accepts a YAML to tune pools and add per-agent overrides.

**v0.1.0b** — Identity attachment + signed audit trail. The post-startup `io.Copy` relay from v0.1.0a is replaced with a single-goroutine `pgproto3.Backend`/`Frontend` message pump that parses every Postgres frontend and backend message, attaches per-connection agent identity (via `application_name=vigil:<base64-token>`), and writes one signed Ed25519 audit row per parsed message into a new `audit` table in `~/.vigil/proxy.db`.

Identity attachment is observability-only — invalid tokens fall back to `agent_id=NULL` rather than rejecting the connection. Forwarding stays bytes-equivalent: the existing `psql` smoke test passes unchanged, and SCRAM-SHA-256 (modern Postgres default) negotiates correctly through the message pump because the single-goroutine design lets the parser see the upstream `Authentication*` challenge and call `frontend.SetAuthType()` before reading the client's matching `'p'` response.

The startup phase (SSL/GSS decline, StartupMessage forwarding) is still parsed in-band so we can negotiate plaintext. See the package doc on `internal/pgproxy/postgres.go` for the message-pump rationale and the SCRAM trap.

v0.1.0d adds fan-out coalescing.

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

## Persistence

State lives in `~/.vigil/` next to the daemon's `vigil.db` so a single backup covers everything Vigil-related:

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

The Postgres proxy starts only when both `--postgres-listen` and `--postgres-upstream` are set and `--postgres-disabled` is not.

### Rate limiting (v0.1.0c)

Three pools ship by default. Without `--ratelimit-config`, every identified agent lands in `agents` and every anonymous client lands in `unauth`. The token bucket is per `(agent_id, pool)`; an empty `agents` pool only blocks one agent, not the rest. The shipped defaults:

| Pool | Burst | Refill (tokens/sec) | Purpose |
|---|---|---|---|
| `production` | 1000 | 500 | Real human/web traffic. Insulated from agent abuse via explicit per-agent mapping. |
| `agents` | 100 | 50 | Identified agents. Generous for normal work; throttles run-away loops. |
| `unauth` | 10 | 5 | Anonymous traffic. Defense against rogue clients. |

Override or extend via `--ratelimit-config`:

```yaml
pools:
  production: { burst: 1000, refill: 500 }
  agents:     { burst: 100,  refill: 50 }
  unauth:     { burst: 10,   refill: 5 }

agents:
  ag_3J9XX: { pool: production }            # promote this agent into the production pool
  ag_AB2YY: { burst: 200, refill: 100 }     # custom bucket for this agent specifically
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
| `internal/policy` | (future) rule engine |
| `internal/mcp` | (future) MCP server for agent introspection |

## License

MIT (see repository root).
