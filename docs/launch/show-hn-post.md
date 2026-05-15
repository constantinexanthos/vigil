# Show HN post — Vigil v0.1.0d

**Title (≤80 chars):**

```
Show HN: Vigil — agent-aware data plane that cuts DB traffic <DEDUP_PERCENT>%
```

**Body:**

Vigil is a single-binary proxy that sits between AI agents and your Postgres database and removes redundant traffic — the same `SELECT * FROM users WHERE email = ?` an LLM "rediscovers" 200 times in 30 seconds. In our refactor-shaped bench it cut upstream queries by <DEDUP_PERCENT>%. Open source, MIT, free for individuals.

Postgres, Redis, Cloudflare, and AWS API Gateway were tuned for human-shaped traffic: one click, one request, one identity per user. Agents fire 50 queries in 2 seconds from a shared API key and re-fire the same query because the model forgot it already asked. Existing rate limiters see one IP; existing connection pools see one role; existing audit logs see "an agent ran a query." None of that is wrong, but none of it is enough.

Vigil is in the data path, not adjacent to it. Five primitives, four shipped today:

- **Per-agent identity.** Stable Ed25519-signed IDs. The proxy attaches them to every Postgres connection so the database, the logs, and the rate limiter can tell `claude-code` from `cursor` from your production web tier.
- **Per-agent rate limiting.** Token-bucket throttling across three pools (`production` / `agents` / `unauth`). One run-away agent doesn't starve another, and it never touches production. Back-pressure, not rejection — the call waits and completes.
- **Fan-out coalescing.** Per-agent LRU cache (1000 entries, 256KB cap, 250ms TTL). Same agent fires the same SELECT inside the window → cached response replayed byte-for-byte, upstream untouched. Deny list covers `nextval`, `now()`, `random()`, `current_user`, advisory locks, and anything inside an explicit transaction.
- **Signed audit trail.** Every parsed Postgres frame logged to SQLite with an Ed25519 signature, agent ID, route, and decision (`allowed` / `rate_limited` / `coalesced`). Replayable.
- **Blast-radius policy.** Coming next milestone — "Agent X cannot DELETE from production" enforced at the proxy, not in the agent's prompt.

**What's NOT in v0.1.0d yet:** identity, audit, rate limit, and coalesce ship today. The policy engine, Redis support, HTTP/L7 proxy, and the MCP server for agent introspection are next. Connection pooling is still 1:1. TLS termination is tracked but not implemented. If you need any of those today, this isn't the release for you.

The dedup number is the headline, so the caveat goes here too: the <DEDUP_PERCENT>% comes from a refactor preset that models an LLM re-fetching the same handful of records. Production-shape traffic against a wide key universe measures at 12%. That's by design — humans don't repeat themselves and Vigil shouldn't pretend they do.

**Try it:**

```
<INSTALL_COMMAND_IF_NOT_BREW>
vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432
PGPASSWORD=test psql -h localhost -p 7432 -U postgres -c 'SELECT 1'
```

Pre-built binaries: https://github.com/constantinexanthos/vigil/releases

Repo: https://github.com/constantinexanthos/vigil

Would love feedback from anyone running a fleet of coding agents against a shared database, especially on what the policy DSL should look like.

— Costa Xanthos (@constantinexanthos)
