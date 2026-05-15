# VS Code

You're using [VS Code](https://code.visualstudio.com/), often with the Copilot or another AI assistant extension. Here's how to get database traffic from AI-driven code execution identified by Vigil.

## How VS Code talks to your database

VS Code itself doesn't connect to Postgres. AI extensions (Copilot, Continue, etc.) write code that *you* then run in the integrated terminal, in a launch.json task, or via the extension's "run this snippet" feature. So "VS Code's database traffic" is really the traffic of whatever runtime ran the AI-suggested code.

## Tier 1 — works automatically (no setup)

When `vigil-proxy v0.1.0e+` is running, the proxy will detect VS-Code-spawned subprocesses from the process tree and tag every audit row + apply the `vscode` rate-limit pool. (Process introspection ships in v0.1.0e — see [`docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md`](../../../docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md) sub-project B.)

Until v0.1.0e, traffic from VS-Code-spawned subprocesses shows up as anonymous in the audit feed — Tier 2 (a helper import in your script) is the path to per-agent attribution today.

## Tier 2 — opt in to richer signed identity (optional)

Wrap the scripts AI extensions ask you to run:

### Python

```python
from vigil import wrap_psycopg
wrap_psycopg()

import psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
```

### Node

```js
const { wrapPg } = require('@vigil/client');
wrapPg();

const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
```

### Go

```go
import "github.com/costaxanthos/vigil/clients/go/vigil"

cfg, err := pgx.ParseConfig(os.Getenv("DATABASE_URL"))
if err != nil { panic(err) }
cfg = vigil.WrapPgxConfig(cfg)
conn, err := pgx.ConnectConfig(ctx, cfg)
```

The helpers are no-ops when `VIGIL_TOKEN` is unset, so the code stays portable across local dev (no proxy), CI (no proxy), and your AI session (proxy + identity).

### Get a token in the shell

The easiest way to populate `VIGIL_TOKEN` for an integrated-terminal session is to launch VS Code through `vigil-run`:

```bash
vigil-run code .
```

Every terminal you open inside that VS Code window inherits `VIGIL_TOKEN`. Any helper-wrapped script picks it up automatically.

## What gets identified vs. what doesn't

| Operation                                       | Identified?                         |
| ----------------------------------------------- | ----------------------------------- |
| Scripts using a Vigil helper package            | Yes                                 |
| Scripts run from a VS Code launched via `vigil-run` | Yes (env-inherited token)        |
| Copilot chat suggestions (text only)            | N/A (no Postgres traffic generated) |
| Copilot's own backend calls                     | N/A (closed integration; not Postgres) |

## Limitations

- Copilot itself is a closed integration — there's no entry point for `vigil-run` to wrap its backend calls. Vigil identifies the *output* of AI suggestions (the scripts you run), not the suggestion-generation API call.
- Helper packages are no-ops without `VIGIL_TOKEN` set.
- Tier 1 won't tag traffic until v0.1.0e. Until then, anonymous-pool rate limits apply.
