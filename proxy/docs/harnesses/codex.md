# OpenAI Codex CLI

You're using [OpenAI Codex CLI](https://github.com/openai/codex-cli), OpenAI's terminal agent. Here's how to get its Postgres traffic identified by Vigil.

## How Codex talks to your database

Codex is a terminal binary (`codex`) that runs in your shell. Tool calls that touch Postgres open connections from inside the codex process — so traffic through `vigil-proxy` shows up as coming from `codex`, on the developer's machine, with whatever user credential the shell environment provides.

## Tier 1 — works automatically (no setup)

When `vigil-proxy v0.1.0e+` is running, the proxy will detect Codex from the process tree and tag every audit row + apply the `codex` rate-limit pool. (Process introspection ships in v0.1.0e — see [`docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md`](../../../docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md) sub-project B.)

Until v0.1.0e, point Codex at port 7432 and traffic shows up as anonymous in the audit feed — Tier 2 (`vigil-run`) is the path to per-agent attribution today.

## Tier 2 — opt in to richer signed identity (optional)

Run Codex through `vigil-run`:

```bash
vigil-run codex
```

`vigil-run` mints a signed identity, caches it in the OS keychain, sets `VIGIL_TOKEN` for the wrapped Codex process, then replaces itself with the Codex binary via `syscall.Exec`. Every Postgres connection Codex makes through `vigil-proxy` carries `application_name=vigil:<token>` in its startup packet, and the proxy attributes everything to your `codex` agent.

Customize who you appear as:

```bash
vigil-run --principal=you@example.com --scopes=read,write codex
```

## What gets identified vs. what doesn't

| Operation                          | Identified? |
| ---------------------------------- | ----------- |
| Postgres queries Codex executes    | Yes         |
| Subprocesses Codex spawns          | Yes (inherited env) |
| HTTP requests to non-Postgres APIs | No (Vigil is a Postgres data plane) |

## Limitations

- The wrapped Codex PID replaces the `vigil-run` PID on Unix — signal handling stays native.
- Long sessions inherit whatever token was minted at start time; refresh by re-running `vigil-run --rotate codex`.
- Tier 1 won't tag traffic until v0.1.0e. Until then, anonymous-pool rate limits apply.
