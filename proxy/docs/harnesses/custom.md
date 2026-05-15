# Custom agents

You're building your own agent — a bot, a script, a service, anything. Here's how to make it work with Vigil.

## How your custom agent talks to your database

You wrote it, so you know. The integration surface is the connection layer: wherever your code opens a Postgres connection, that's where Vigil wants to see `application_name=vigil:<token>`.

## Tier 1 — works automatically (no setup)

When `vigil-proxy v0.1.0e+` is running, the proxy will detect well-known agent binaries from the process tree and tag every audit row + apply per-agent rate limits. (Process introspection ships in v0.1.0e — see [`docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md`](../../../docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md) sub-project B.)

For *custom* agents Tier 1 detection won't fire unless your binary's name matches a known harness pattern. Tier 2 below is the canonical path.

## Tier 2 — opt in to richer signed identity (optional)

Two paths, ordered easiest first:

### A. Wrap your binary with `vigil-run` (recommended)

```bash
vigil-run --name=my-custom-agent ./my-bot
```

`vigil-run` mints a signed identity, sets `VIGIL_TOKEN` in your bot's environment, and `exec`s your binary. If your bot uses one of the helper packages (below), Vigil identity attaches to every Postgres connection automatically.

### B. Set `application_name=vigil:<token>` yourself

If you can't or don't want to use `vigil-run`, set the application name directly. Vigil ships per-language helpers; here are the three snippets:

#### Go (pgx)

```go
import (
    "github.com/jackc/pgx/v5"
    "github.com/costaxanthos/vigil/clients/go/vigil"
)

cfg, err := pgx.ParseConfig(os.Getenv("DATABASE_URL"))
if err != nil { panic(err) }
cfg = vigil.WrapPgxConfig(cfg)
conn, err := pgx.ConnectConfig(ctx, cfg)
```

Or for bare DSN strings:

```go
dsn := vigil.WrapDSN(os.Getenv("DATABASE_URL"))
```

#### Python (psycopg / asyncpg / SQLAlchemy)

```python
from vigil import wrap_dsn, wrap_psycopg

# Option 1: pure-function (works with anything that takes a DSN)
dsn = wrap_dsn(os.environ["DATABASE_URL"])

# Option 2: monkey-patch psycopg so every connect() picks up identity
wrap_psycopg()
import psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
```

#### Node (pg)

```js
const { wrapPg, wrapDSN } = require('@vigil/client');

// Option 1: monkey-patch — every new Client/Pool gets identity
wrapPg();
const { Client } = require('pg');
const c = new Client(process.env.DATABASE_URL);

// Option 2: bare DSN
const dsn = wrapDSN(process.env.DATABASE_URL);
```

### Minting a token without `vigil-run`

If you really want to handle the token lifecycle yourself, POST to vigil-proxy's `/identities`:

```bash
curl -X POST http://localhost:7878/identities \
  -H 'content-type: application/json' \
  -d '{"agent_name":"my-custom-agent","principal":"me@example.com","scopes":["read","write"]}'
```

The response contains `token.token` — set that as `VIGIL_TOKEN` in your environment and the helpers pick it up.

## What gets identified vs. what doesn't

| Operation                                          | Identified?                                |
| -------------------------------------------------- | ------------------------------------------ |
| Postgres connections opened with a helper-wrapped DSN | Yes                                      |
| Connections from binaries launched via `vigil-run` | Yes (helper picks up `VIGIL_TOKEN` from env) |
| Connections that bypass the proxy                  | No (vigil-proxy is the attribution surface) |
| HTTP/other-protocol traffic                        | No (Vigil's a Postgres data plane today)   |

## Limitations

- Helper packages preserve a user-supplied `application_name` via `:`-chaining (`my-svc:vigil:<token>`). If you parse `application_name` server-side, account for that pattern.
- Tokens expire (default 24h). If your bot runs longer, refresh by re-running `vigil-run --rotate` or by re-minting via the `/identities` endpoint.
- Vigil verifies the Ed25519 signature; a tampered token gets dropped (audit row carries no agent_id, connection still proxies — observability before enforcement).
