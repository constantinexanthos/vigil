"use client"

import { CodeBlock } from "./code-block"

export function CLIReference() {
  return (
    <>
      {/* vigil watch */}
      <section id="vigil-watch" className="mb-16 scroll-mt-20">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // cli reference
        </span>
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          vigil watch
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Start the Vigil daemon. It monitors filesystem events, detects running
          AI agents, and records every action to the local SQLite store. Runs in
          the foreground by default &mdash; use{" "}
          <code className="text-[#22d3ee] text-xs bg-[#0a0a0a] px-1.5 py-0.5 border border-[#2a2e37]">
            --daemon
          </code>{" "}
          to background it.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil watch [paths...] [options]

Arguments:
  [paths...]              Directories to watch (default: cwd)

Options:
  -d, --daemon            Run as background daemon
  -c, --config <path>     Path to config file
  --ignore <patterns>     Additional ignore patterns
  --no-process-scan       Disable process detection
  --verbose               Enable debug logging`}
        />

        <CodeBlock
          command="vigil watch ~/projects ~/work --daemon"
          output={`[vigil] daemon started (pid 41822)
[vigil] watching ~/projects (recursive)
[vigil] watching ~/work (recursive)
[vigil] process scanner active
[vigil] ready — PID file: ~/.local/share/vigil/vigil.pid`}
        />
      </section>

      {/* vigil status */}
      <section id="vigil-status" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          vigil status
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Show a snapshot of the current daemon state: active agents, their
          sessions, file counts, collision warnings, and overall resource usage.
          Exits with code 1 if collisions are active, making it useful in CI
          scripts.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil status [options]

Options:
  --json                  Output as JSON
  --watch                 Continuously refresh (like top)
  --interval <secs>       Refresh interval for --watch (default: 2)
  --no-color              Disable colored output`}
        />

        <CodeBlock
          command="vigil status"
          output={`AGENTS (3 active)
  claude-code    pid 41930   session s_7f2a   14 files   0 collisions
  cursor         pid 42101   session s_8b3c    6 files   1 collision
  codex          pid 42200   session s_9d4e    3 files   1 collision

COLLISIONS (1 active)
  ⚠ src/lib/api.ts
    cursor (s_8b3c) wrote at 14:23:18
    codex  (s_9d4e) wrote at 14:23:41
    window: 23s    risk: high

UPTIME  2h 07m    EVENTS  1,204    STORE  3.4 MB`}
        />
      </section>

      {/* vigil log */}
      <section id="vigil-log" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          vigil log
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Query the event stream. Filter by agent, session, time range, file
          path, or event flags. By default shows the most recent events across
          all agents.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil log [options]

Options:
  --agent <name>          Filter by agent name
  --session <id>          Filter by session ID
  --since <duration>      Events after duration (e.g., 1h, 30m, 7d)
  --path <glob>           Filter by file path pattern
  --flags <flags>         Filter by flags (collision, hallucination)
  --fields <fields>       Additional columns (confidence, tokens)
  --limit <n>             Max events to show (default: 20)
  --json                  Output as JSON
  -f, --follow            Stream new events in real time`}
        />

        <CodeBlock
          command="vigil log --agent claude-code --since 1h --limit 3"
          output={`2025-01-15 14:23:01  claude-code  WRITE  src/lib/api.ts         +42 -8
2025-01-15 14:22:58  claude-code  WRITE  src/lib/api.ts         +15 -3
2025-01-15 14:22:12  claude-code  WRITE  src/lib/utils.ts       +7 -2`}
        />
      </section>

      {/* vigil cost */}
      <section id="vigil-cost" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          vigil cost
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Show token usage and estimated cost breakdowns. Aggregates by agent,
          session, or time period. Uses actual token counts from hooked agents
          and estimates for the rest.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil cost [options]

Options:
  --since <duration>      Time window (e.g., 24h, 7d, 30d)
  --agent <name>          Filter by agent name
  --group-by <field>      Group by: agent, session, day (default: agent)
  --json                  Output as JSON
  --no-projections        Hide monthly projections`}
        />

        <CodeBlock
          command="vigil cost --since 7d --group-by day"
          output={`DATE          SESSIONS   TOKENS        ESTIMATED COST
2025-01-15    8          1,842,300     $6.41
2025-01-14    5          1,123,400     $3.92
2025-01-13    11         2,401,800     $8.74
2025-01-12    3          487,200       $1.68
2025-01-11    7          1,654,100     $5.83
2025-01-10    6          1,201,000     $4.17
2025-01-09    9          1,978,500     $7.02
──────────────────────────────────────────────────
TOTAL         49         10,688,300    $37.77

DAILY AVG  $5.40     MONTHLY PROJ  $162.00`}
        />
      </section>

      {/* vigil hook */}
      <section id="vigil-hook" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          vigil hook
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Manage deep integration hooks for supported agents. Currently supports
          Claude Code&apos;s native hooks API. Hooks provide richer telemetry
          than filesystem watching alone &mdash; prompt context, tool calls,
          token counts, and model selection.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil hook <subcommand> [options]

Subcommands:
  init                    Install hooks for detected agents
  status                  Show installed hooks and their state
  remove                  Remove installed hooks

Options:
  --agent <name>          Target a specific agent (default: all)
  --force                 Overwrite existing hooks
  --dry-run               Show what would be installed`}
        />

        <CodeBlock
          command="vigil hook init"
          output={`[vigil] scanning for supported agents...
[vigil] found: claude-code
[vigil] installed hooks:
  ~/.claude/hooks/pre-tool-use.sh   → vigil event capture
  ~/.claude/hooks/post-tool-use.sh  → vigil result capture
  ~/.claude/hooks/on-error.sh       → vigil error tracking
[vigil] hooks active — claude-code integration: deep`}
        />
      </section>
    </>
  )
}
