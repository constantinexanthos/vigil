# Vigil

**The seatbelt for your agent fleet.**

[![Proxy CI](https://github.com/constantinexanthos/vigil/actions/workflows/proxy-ci.yml/badge.svg)](https://github.com/constantinexanthos/vigil/actions/workflows/proxy-ci.yml)
[![Daemon CI](https://github.com/constantinexanthos/vigil/actions/workflows/daemon-ci.yml/badge.svg)](https://github.com/constantinexanthos/vigil/actions/workflows/daemon-ci.yml)
[![Site CI](https://github.com/constantinexanthos/vigil/actions/workflows/site-ci.yml/badge.svg)](https://github.com/constantinexanthos/vigil/actions/workflows/site-ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Languages](https://img.shields.io/badge/languages-Go%20%C2%B7%20Rust%20%C2%B7%20TypeScript-informational)

Vigil is the data plane between AI agents and the systems they touch. The databases, APIs, and internal services your agents call were built for human request volume and human request shape — agents fan out, retry hot, and run unattended. Vigil sits in front of all of it: per-agent identity, fan-out coalescing, rate limiting that knows which agent is which, blast-radius policy, signed audit trail.

## What's in this repo

- **`proxy/`** — Go data plane. The middleware that sits between agents and the systems they touch. Issues identities, applies policy, attaches the agent ID to every request. MIT-licensed. *Lands with v0.0.1.*
- **`daemon/`** — Rust background process. Watches agent activity on the local machine: filesystem events, git activity, JSONL transcripts from Claude Code / Cursor / Codex, cost and token usage. Feeds the operator UI.
- **`app/`** — Tauri desktop app. The operator UI: live agent grid, file hotspots, cross-agent collisions, per-session detail.
- **`site/`** — Next.js marketing site for [bevigil.ai](https://bevigil.ai).

## Status

**v0.0.1** ships the proxy as an identity issuer — every agent gets a stable ID, every request through the proxy is signed and tagged. The full v0 build sequence is sequenced over twelve weeks; data-plane features (rate shaping, fan-out coalescing, policy, audit replay) ship incrementally. Per-feature specs land in `docs/superpowers/specs/`.

Today the daemon and operator app are usable on their own as a local "what are my agents doing right now" surface. The proxy lands first, then the data-plane features behind it.

## Getting started

The `curl` quickstart for issuing an identity ships with `proxy/` in v0.0.1. Until then, the daemon runs standalone:

```bash
cd daemon
cargo run -- watch ~/projects
```

That gets you the activity feed. The Tauri app in `app/` reads from the same local SQLite store.

## License

MIT. See [`LICENSE`](LICENSE).

## Security

To report a security issue, see [`SECURITY.md`](SECURITY.md) — email `security@bevigil.ai`.
