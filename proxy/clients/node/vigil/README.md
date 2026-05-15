# @vigil/client — Node helper

Attach a Vigil identity token to your Postgres connection so [vigil-proxy](https://bevigil.ai) sees who's talking.

## Install

```bash
npm install @vigil/client
```

(Not yet on npm — install from source for now:)

```bash
npm install /path/to/proxy/clients/node/vigil
```

## Use it

### With node-postgres (the `pg` package)

Monkey-patch once at startup; every subsequent `new Client(...)` / `new Pool(...)` carries identity automatically.

```js
const { wrapPg } = require('@vigil/client');
wrapPg();

const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
await client.connect(); // application_name=vigil:<token> attached
```

### With anything else (asyncpg-equivalent, Sequelize, raw connection strings)

Edit the DSN directly.

```js
const { wrapDSN } = require('@vigil/client');
const dsn = wrapDSN(process.env.DATABASE_URL);
// hand `dsn` to your driver
```

## How it works

The helper reads `VIGIL_TOKEN` from your environment and appends `application_name=vigil:<token>` to the connection string. vigil-proxy parses that, verifies the Ed25519 signature, and attributes every audit row + rate-limit decision to the correct agent.

When `VIGIL_TOKEN` is unset, the helper is a no-op — code works unchanged in environments without vigil-run (CI, local Postgres, etc).

## Chaining with an existing application_name

If you already set `application_name=my-app` for query-log grouping, the helper preserves it: `my-app:vigil:<token>`. The proxy parses the first `vigil:` prefix it finds, so colon chaining is safe.

## Tests

```bash
npm test
```

Tests use Node's built-in `node:test` runner — zero dev dependencies.

## License

MIT.
