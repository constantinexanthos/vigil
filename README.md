# Vigil

**The seatbelt for your agent fleet.** Part of [bevigil.ai](https://bevigil.ai).

```bash
brew install constantinexanthos/vigil/vigil
vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432
```

That's the full install. Single binary, no runtime dependencies. Every Postgres query from your agents is identified, rate-limited per-agent, deduplicated, and audited.

[![Proxy CI](https://github.com/constantinexanthos/vigil/actions/workflows/proxy-ci.yml/badge.svg)](https://github.com/constantinexanthos/vigil/actions/workflows/proxy-ci.yml)
[![Site CI](https://github.com/constantinexanthos/vigil/actions/workflows/site-ci.yml/badge.svg)](https://github.com/constantinexanthos/vigil/actions/workflows/site-ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Languages](https://img.shields.io/badge/languages-Go%20%C2%B7%20Rust%20%C2%B7%20TypeScript-informational)

Vigil is the data plane between AI agents and the systems they touch. The databases, APIs, and internal services your agents call were built for human request volume and human request shape — agents fan out, retry hot, and run unattended. Vigil sits in front of all of it: per-agent identity, fan-out coalescing, rate limiting that knows which agent is which, blast-radius policy, signed audit trail.

## What's in this repo

- **`proxy/`** — Go data plane. The middleware that sits between agents and Postgres. Issues identities, applies rate-limit and coalescing policy, signs audit rows. Ships as `vigil-proxy` via Homebrew. MIT-licensed. **The product.**
- **`app/`** — Tauri desktop operator UI. Reads `~/.vigil/proxy.db` and surfaces per-agent activity, audit feed, and decision counters. Optional — `vigil-proxy` runs fine headless.
- **`site/`** — Next.js marketing site for [bevigil.ai](https://bevigil.ai).
- **`docs/`** — Product specs, launch artifacts, and QA reports under `docs/superpowers/`, `docs/launch/`, and `docs/qa/`.

## Status

**v0.1.0d** ships the five primitives the website talks about: per-agent identity (Ed25519), per-agent rate limiting (3 pools), fan-out coalescing (per-agent LRU, 250ms TTL), signed audit trail (SQLite, decision column), and an MCP stdio server for agent introspection. Policy / blast-radius control is the next milestone (v0.1.0e). The full design lives in `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md`; what's deferred is listed there in the "Out of scope for v0.1.0d" section.

## Getting started

The two-line install at the top of this README is the full path. After running it, point any Postgres client at `localhost:7432` and the proxy forwards to whatever `--postgres-upstream` points at:

```bash
PGPASSWORD=… psql -h localhost -p 7432 -U postgres
```

For identified-agent traffic, mint an identity via the proxy's HTTP API and pass the token in `application_name=vigil:<token>`:

```bash
curl -X POST http://localhost:7878/identities \
  -H 'content-type: application/json' \
  -d '{"agent_name":"claude-code","principal":"you@example.com","scopes":["read","write"]}'
```

See `proxy/README.md` for the full operator guide, MCP server setup, and bench harness.

## License

MIT. See [`LICENSE`](LICENSE).

## Security

To report a security issue, see [`SECURITY.md`](SECURITY.md) — email `security@bevigil.ai`.
