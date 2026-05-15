# vigil-client — Python helper

Attach a Vigil identity token to your Postgres connection so [vigil-proxy](https://bevigil.ai) sees who's talking.

## Install

```bash
pip install vigil-client
```

(Not yet on PyPI — install from source for now:)

```bash
pip install /path/to/proxy/clients/python/vigil
```

## Use it

### The pure-function API (recommended)

Works with anything that accepts a DSN string — asyncpg, SQLAlchemy, raw psycopg, …

```python
import os
from vigil import wrap_dsn

dsn = wrap_dsn(os.environ["DATABASE_URL"])
# pass dsn to your favorite client
```

### The monkey-patch convenience

If you only use psycopg2 or psycopg (v3) and want every `connect()` call to be wrapped automatically:

```python
from vigil import wrap_psycopg
wrap_psycopg()

import psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
# `application_name=vigil:<token>` is now attached to every connection.
```

The patch is idempotent and works for both psycopg2 and psycopg3. Modules that aren't installed are silently skipped.

If you care about portability across psycopg versions or run into a corner case the monkey-patch doesn't cover, prefer `wrap_dsn` — that's the supported escape hatch.

## How it works

The helper reads `VIGIL_TOKEN` from your environment and appends `application_name=vigil:<token>` to the connection string. vigil-proxy parses that, verifies the Ed25519 signature, and attributes every audit row + rate-limit decision to the correct agent.

When `VIGIL_TOKEN` is unset (e.g. you're running locally without vigil-run), the helper is a no-op — your code works exactly the same way it did before the helper landed.

## Chaining with an existing application_name

If you already set `application_name=my-app` for query-log grouping, the helper preserves it: `my-app:vigil:<token>`. The proxy parses the first `vigil:` prefix it finds, so colon chaining is safe.

## Tests

```bash
pip install -e .[test]
pytest tests/
```

## License

MIT.
