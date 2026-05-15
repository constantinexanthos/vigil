# Cursor

You're using [Cursor](https://cursor.sh/), the AI-native editor. Here's how to get its Postgres traffic identified by Vigil.

## How Cursor talks to your database

Cursor's AI features generate code, scripts, and shell commands that run in your repo. Most "Cursor touches my database" interactions actually happen inside scripts Cursor either edited or executed — `python migrate.py`, `node script.js`, a shell command in the integrated terminal. So "Cursor's traffic" is really the traffic of whatever language runtime Cursor invoked on your behalf.

## Tier 1 — works automatically (no setup)

When `vigil-proxy v0.1.0e+` is running, the proxy will detect Cursor-spawned subprocesses from the process tree and tag every audit row + apply the `cursor` rate-limit pool. (Process introspection ships in v0.1.0e — see [`docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md`](../../../docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md) sub-project B.)

Until v0.1.0e, traffic from Cursor-spawned subprocesses shows up as anonymous in the audit feed — Tier 2 (a helper import in the script Cursor runs) is the path to per-agent attribution today.

## Tier 2 — opt in to richer signed identity (optional)

Two paths, depending on whether you want to wrap Cursor itself or just the scripts it runs:

### A. Wrap the script in code (recommended)

If Cursor is running, say, a Python script that connects to Postgres, add one line at the top:

```python
from vigil import wrap_psycopg
wrap_psycopg()

import psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
# `application_name=vigil:<token>` attached automatically.
```

Same for Node:

```js
const { wrapPg } = require('@vigil/client');
wrapPg();

const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
```

You'll need `VIGIL_TOKEN` in the script's environment — either set it once in your shell (`export VIGIL_TOKEN=...`) or run the script under `vigil-run`:

```bash
vigil-run python migrate.py
```

### B. Wrap Cursor itself

If you want every command Cursor spawns to inherit Vigil identity automatically, launch Cursor through `vigil-run`:

```bash
vigil-run cursor
```

Any subprocess Cursor spawns inherits `VIGIL_TOKEN`. Scripts that use the helper packages will pick it up; scripts that don't won't.

## What gets identified vs. what doesn't

| Operation                                    | Identified?                          |
| -------------------------------------------- | ------------------------------------ |
| Scripts using `vigil.wrap_psycopg()`/`wrapPg()` | Yes                                |
| Scripts run under `vigil-run`                | Yes (env-inherited token)            |
| Cursor's built-in editor features            | N/A (no Postgres traffic from the editor itself) |
| Direct LLM chat (no code execution)          | N/A (no traffic to attribute)        |

## Limitations

- Cursor's closed-source editor process can't be patched; the integration point is the subprocesses it spawns.
- Helper packages are no-ops without `VIGIL_TOKEN` set — code stays portable.
- Tier 1 won't tag traffic until v0.1.0e. Until then, anonymous-pool rate limits apply to Cursor-spawned traffic.
