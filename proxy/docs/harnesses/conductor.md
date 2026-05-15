# Conductor

You're using [Conductor](https://conductor.build/), the AI agent orchestration UI. Here's how to get Conductor-managed agents identified by Vigil.

## How Conductor talks to your database

Conductor spawns harness commands (`claude`, `codex`, `cursor`, etc.) inside dedicated git worktrees, one per active agent task. Database traffic from those agents flows through the harness's own process, then (when configured) through `vigil-proxy`. Conductor itself doesn't touch Postgres; the agents it spawns do.

## Tier 1 — works automatically (no setup)

When `vigil-proxy v0.1.0e+` is running, the proxy will detect Conductor-spawned harnesses from the process tree (matching on the spawned harness binary's name and the Conductor parent) and tag every audit row + apply the right per-harness rate-limit pool. (Process introspection ships in v0.1.0e — see [`docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md`](../../../docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md) sub-project B.)

Until v0.1.0e, Conductor-managed agents' traffic shows up as anonymous in the audit feed — Tier 2 (`vigil-run` in your Conductor command config) is the path to per-agent attribution today.

## Tier 2 — opt in to richer signed identity (optional)

Wrap each harness command Conductor spawns with `vigil-run`. The exact config location depends on your Conductor setup. <TODO: confirm with Costa — Conductor's per-project command config format and path.>

Typical pattern (illustrative — substitute your actual Conductor config schema):

```yaml
# .conductor/config.yaml (example shape; verify against your setup)
harness_commands:
  claude: vigil-run claude
  codex: vigil-run codex
  cursor: vigil-run cursor
```

`vigil-run` mints a per-`(principal, agent_name)` identity, caches it in the OS keychain, and inherits across multiple Conductor sessions on the same machine. Each agent (Claude Code, Codex, Cursor) gets a distinct cached token and shows up separately in the audit feed.

## What gets identified vs. what doesn't

| Operation                                     | Identified? |
| --------------------------------------------- | ----------- |
| Postgres traffic from Conductor-spawned agents | Yes        |
| Subprocesses agents themselves spawn          | Yes (inherited env) |
| Conductor's own coordination traffic          | N/A (no Postgres traffic generated) |

## Limitations

- `vigil-run` token cache is per `<principal>:<agent_name>` key — agents that don't propagate their own identity won't get separate audit rows beyond the agent_name discriminator.
- Conductor agent commands customized in-UI rather than in a checked-in config still need the `vigil-run` prefix — wrap at the launcher level.
- Tier 1 won't tag traffic until v0.1.0e. Until then, anonymous-pool rate limits apply.
