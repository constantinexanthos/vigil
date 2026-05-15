# Waitlist announcement email — Vigil v0.1.0d

## Subject lines (pick one)

1. We cut agent DB traffic by <DEDUP_PERCENT>% — Vigil is live
2. The seatbelt for your agent fleet is ready
3. What if your AI agents stopped hammering your database?

---

## Body

Hey,

You signed up for Vigil a while back. Quick update: v0.1.0d is out and it's the first version I'd actually drop in front of a database I cared about.

What's real today, all in a single Go binary:

- Per-agent identity. Every agent gets a stable Ed25519-signed ID. The proxy attaches it to every Postgres connection so the DB and your logs can finally tell `claude-code` from `cursor` from your prod web tier.
- Per-agent rate limiting. Three pools — `production`, `agents`, `unauth`. One run-away agent drains its bucket; the others keep working; production never feels it.
- Fan-out coalescing. Per-agent LRU cache, 250ms TTL. The same agent firing the same SELECT inside the window gets a cached reply, upstream untouched.
- Signed audit trail. Every parsed Postgres frame logged to SQLite with an Ed25519 signature, agent_id, route, and decision (`allowed` / `rate_limited` / `coalesced`).

The headline number: <DEDUP_PERCENT>% dedup on a refactor-shaped bench. Production-shape traffic measures at 12% — by design. Humans don't repeat themselves and Vigil doesn't pretend they do.

To try it:

```
brew install vigil
vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432
```

<!-- TODO(launch): confirm brew formula published; if not, swap to <INSTALL_COMMAND_IF_NOT_BREW> -->

Then point `psql` (or your app) at `localhost:7432` and you're through the proxy. Free for individuals. MIT.

Up next: the policy engine — "Agent X cannot DELETE from production" enforced at the proxy, not in the agent's prompt where it can be jailbroken out of.

If you run any of this against a real workload, I'd genuinely love to hear what breaks. Just reply to this email.

Costa
github.com/constantinexanthos/vigil
