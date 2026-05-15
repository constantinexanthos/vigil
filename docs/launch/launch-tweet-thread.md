# Launch tweet thread — Vigil v0.1.0d

Each tweet ≤280 chars. Character count annotated below each tweet.
Plain text. No emoji. One self-mention only.

---

**Tweet 1 — the hook**

We just cut agent DB traffic by <DEDUP_PERCENT>% with a single binary in the request path.

Vigil is the agent-aware data plane: per-agent identity, rate limits, fan-out coalescing, signed audit. Open source. MIT.

The seatbelt for your agent fleet.

(249/280)

---

**Tweet 2 — the problem**

Postgres, Redis, Cloudflare were tuned for humans. Click a button, wait for one response.

Agents fire 50 queries in 2 seconds, re-ask the same question 200 times because the model forgot, and five of them share one API key. Existing infrastructure sees one client.

(265/280)

---

**Tweet 3 — identity + audit**

Vigil issues a stable Ed25519 ID per agent and attaches it to every Postgres connection. Every parsed frame is signed and logged with an agent_id, route, and decision.

Now your DB, your logs, and your dashboard can tell Claude Code from Cursor from prod traffic.

(263/280)

---

**Tweet 4 — rate limit**

Per-agent token buckets across three pools: production, agents, unauth.

One agent in a hot loop drains its bucket. The other agents keep working. Production never feels it.

Back-pressure, not rejection — the call waits and completes.

(235/280)

---

**Tweet 5 — coalesce + policy**

Fan-out coalescing: per-agent LRU cache, 250ms TTL, 1000 entries. Same agent fires the same SELECT inside the window → cached response, upstream untouched.

Hard deny list for nextval/now()/random()/transactions.

Blast-radius policy lands next milestone.

(255/280)

---

**Tweet 6 — install**

One binary, no CGO, no daemon, no Redis required.

  <INSTALL_COMMAND_IF_NOT_BREW>
  vigil-proxy --postgres-listen :7432 \
    --postgres-upstream localhost:5432

Point psql at :7432 and you're through the proxy. Free for individuals.

(234/280)

---

**Tweet 7 — links**

Show HN: <SHOW_HN_URL>
Source: github.com/constantinexanthos/vigil

Built by <@TWITTER_HANDLE>. MIT. Single binary. We're at v0.1.0d — identity, audit, rate-limit, coalesce shipped. Policy engine and MCP server next.

(216/280)
