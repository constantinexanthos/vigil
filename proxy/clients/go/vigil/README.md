# vigil — Go client helper

Attach a Vigil identity token to your Postgres connection so [vigil-proxy](https://bevigil.ai) sees who's talking.

This package is one of the three convenience layers Vigil ships:

| Path                                                | Easiest when                                                |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `vigil-run <your-binary>`                           | You don't want to touch your code.                          |
| `vigil.WrapPgxConfig(cfg)` / `vigil.WrapDSN(dsn)`   | You're writing Go and want identity attached in-code.       |

## Install

```bash
go get github.com/costaxanthos/vigil/clients/go/vigil
```

## Use with pgx

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

## Use with a bare DSN

```go
dsn := vigil.WrapDSN(os.Getenv("DATABASE_URL"))
// pass dsn to database/sql, pgxpool, or whatever client you use
```

## How it works

The helper reads `VIGIL_TOKEN` from your environment and appends `application_name=vigil:<token>` to the connection's startup packet. `vigil-proxy` parses that string, verifies the Ed25519 signature, and attributes every audit row + rate-limit decision to the correct agent.

When `VIGIL_TOKEN` is unset (e.g. you're running locally without vigil-run), the helper is a no-op — your code works exactly the same way it did before the helper landed.

## Chaining with an existing application_name

If you already set `application_name=my-app` for query-log grouping, the helper preserves it: `my-app:vigil:<token>`. The proxy parses the first `vigil:` prefix it finds, so colon chaining is safe.

## License

MIT.
