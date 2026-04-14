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
          AI agents, and records every action to the local SQLite store.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil watch <paths...>

Arguments:
  <paths...>              Directories to watch (required)`}
        />

        <CodeBlock
          command="vigil watch ~/projects"
          output={`[vigil] daemon started (pid 41822)
[vigil] watching ~/projects (recursive)
[vigil] process scanner active
[vigil] ready`}
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
          output={`vigil status`}
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
          Query the event stream. Filter by agent or file path. By default shows
          the most recent events across all agents.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil log [options]

Options:
  --agent <name>          Filter by agent name
  --file <glob>           Filter by file path pattern
  --limit <n>             Max events to show (default: 20)`}
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
  --sessions              Show per-session breakdown`}
        />

        <CodeBlock
          command="vigil cost --since 7d"
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

      {/* vigil init */}
      <section id="vigil-init" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          vigil init
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Register Claude Code hooks so Vigil can capture richer telemetry
          &mdash; token counts, model selection, and tool calls &mdash; beyond
          what filesystem watching alone provides.
        </p>

        <CodeBlock
          title="Usage"
          output={`vigil init`}
        />

        <CodeBlock
          command="vigil init"
          output={`[vigil] registering Claude Code hooks...
[vigil] hook registered: PreToolUse
[vigil] hook registered: PostToolUse
[vigil] hook registered: Stop
[vigil] hooks active`}
        />
      </section>
    </>
  )
}
