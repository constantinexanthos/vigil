# Claude Code

You're using [Claude Code](https://docs.claude.com/en/docs/claude-code), Anthropic's terminal CLI for agentic coding. Here's how to get its Postgres traffic identified by Vigil.

## How Claude Code talks to your database

Claude Code is a terminal binary (`claude`) that you run from your shell. When it executes a tool call that touches Postgres, it spawns a connection from inside its own process — so any traffic going through `vigil-proxy` shows up as coming from the `claude` binary, on the developer's machine, with whatever user credential the shell environment exposes.

## Tier 1 — works automatically (no setup)

When `vigil-proxy v0.1.0e+` is running, the proxy will detect Claude Code from the process tree and tag every audit row + apply the `claude-code` rate-limit pool. (Process introspection ships in v0.1.0e — see [`docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md`](../../../docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md) sub-project B.)

Until v0.1.0e, point Claude Code at port 7432 and traffic shows up as anonymous in the audit feed — Tier 2 (`vigil-run`) is the path to per-agent attribution today.

## Tier 2 — opt in to richer signed identity (optional)

Run Claude Code through `vigil-run`:

```bash
vigil-run claude
```

That's it. `vigil-run` mints a signed Ed25519 identity, caches it in the OS keychain, and re-uses it on every subsequent invocation. Inside Claude Code's shell environment `VIGIL_TOKEN` is set; any Postgres connection Claude Code makes through `vigil-proxy` carries `application_name=vigil:<token>` in its startup packet, and the proxy attributes everything to your `claude-code` agent.

Customize who you appear as:

```bash
vigil-run --principal=you@example.com --scopes=read,write claude
```

## What gets identified vs. what doesn't

| Operation                                | Identified? |
| ---------------------------------------- | ----------- |
| `psql` / `pg` queries Claude Code issues | Yes         |
| Subprocesses Claude Code spawns          | Yes (inherited env) |
| HTTP requests to non-Postgres APIs       | No (Vigil is a Postgres data plane) |

## Limitations

- The wrapped command's signal handling is preserved (`vigil-run` uses `syscall.Exec` so the wrapper PID is replaced on Unix).
- If the token expires mid-session, the cached entry refreshes on the next `vigil-run` call — long sessions inherit whatever was minted at start time.
- Tier 1 won't tag traffic until v0.1.0e. Until then, anonymous-pool rate limits apply.
