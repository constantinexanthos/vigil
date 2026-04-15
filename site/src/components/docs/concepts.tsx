"use client"

import { CodeBlock } from "./code-block"

export function Concepts() {
  return (
    <>
      {/* Universal Capture */}
      <section id="universal-capture" className="mb-16 scroll-mt-20">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // concepts
        </span>
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Universal Capture
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Every AI agent that touches your code &mdash; whether it&apos;s Claude
          Code with deep hooks integration, Cursor via its extension API, or an
          unknown process writing files &mdash; gets captured in a single unified
          event stream. No plugins to install, no agents to configure.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          <span className="text-[#e4e4e7] font-mono font-semibold">How it works:</span>{" "}
          Vigil&apos;s daemon combines three detection layers. Layer 1 watches
          filesystem events (file creates, writes, deletes) and correlates them
          with running processes to attribute each change to a specific agent.
          Layer 2 connects to agent&ndash;specific APIs &mdash; Claude Code&apos;s
          hooks, Cursor&apos;s extension bus, OpenTelemetry collectors &mdash; for
          richer metadata like prompt context and tool calls. Every event lands in
          a local SQLite store with sub&ndash;millisecond timestamps.
        </p>

        <CodeBlock
          command="vigil log --agent claude-code --limit 5"
          output={`2025-01-15 14:23:01  WRITE   src/lib/api.ts         +42 -8
2025-01-15 14:22:58  WRITE   src/lib/api.ts         +15 -3
2025-01-15 14:22:41  WRITE   src/utils/helpers.ts   +28 -0
2025-01-15 14:22:30  READ    src/utils/helpers.ts
2025-01-15 14:22:12  WRITE   src/lib/utils.ts       +7 -2`}
        />
      </section>

      {/* Collision Detection */}
      <section id="collision-detection" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Collision Detection
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          When two agents edit the same file within a configurable time window,
          Vigil flags a collision. This is the most common source of silent bugs
          in multi&ndash;agent workflows &mdash; Agent A refactors a function
          while Agent B adds a new call to the old signature. Without Vigil,
          you&apos;d only discover the break at runtime.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          <span className="text-[#e4e4e7] font-mono font-semibold">How it works:</span>{" "}
          The daemon maintains a sliding window (default 30 seconds) over the
          event stream. When overlapping writes from different agents hit the same
          file path, a collision record is created linking both sessions. The CLI
          and menu bar app surface these instantly with file&ndash;level detail.
        </p>

        <CodeBlock
          command="vigil status"
          output={`AGENTS (2 active)
  claude-code    pid 41930   session s_7f2a   14 files   1 collision
  cursor         pid 42101   session s_8b3c    6 files   1 collision

COLLISIONS (1 active)
  ⚠ src/lib/api.ts
    claude-code (s_7f2a) wrote at 14:23:01
    cursor      (s_8b3c) wrote at 14:23:18
    window: 17s    risk: high`}
        />
      </section>

      {/* Confidence Scoring */}
      <section id="confidence-scoring" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Confidence Scoring
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Not all agent outputs are equal. A one&ndash;line typo fix is almost
          certainly correct. A 200&ndash;line refactor of code the agent has never
          seen before is risky. Vigil assigns a confidence score to each agent
          session based on observable signals &mdash; not guesses.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          <span className="text-[#e4e4e7] font-mono font-semibold">How it works:</span>{" "}
          The scoring engine weighs multiple factors: the ratio of lines read to
          lines written (agents that read more before writing score higher),
          whether the agent accessed test files, whether it wrote tests alongside
          production code, the size and complexity of the diff, and historical
          accuracy for that agent type. Scores range from 0&ndash;100, where
          anything below 60 triggers a review warning.
        </p>

        <CodeBlock
          command="vigil log --agent cursor --fields confidence"
          output={`SESSION   CONFIDENCE   FILES   READS   WRITES   TESTS
s_8b3c    82           6       14      8        2
s_7e1a    47           12      3       28       0
s_6d0f    91           2       8       4        2`}
        />
      </section>

      {/* Cost Intelligence */}
      <section id="cost-intelligence" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Cost Intelligence
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          AI agents consume tokens, and tokens cost money. Vigil tracks estimated
          spend per agent, per session, and per time period &mdash; giving you a
          real burn rate instead of a surprise invoice at the end of the month.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          <span className="text-[#e4e4e7] font-mono font-semibold">How it works:</span>{" "}
          For agents with deep hooks (Claude Code), Vigil captures actual token
          counts from the API response. For others, it estimates based on file
          sizes read and written, using published per&ndash;token pricing for each
          model. The{" "}
          <code className="text-[#22d3ee] text-xs bg-[#0a0a0a] px-1.5 py-0.5 border border-[#2a2e37]">
            vigil cost
          </code>{" "}
          command breaks down spend by agent, session, and time window.
        </p>

        <CodeBlock
          command="vigil cost --since 24h"
          output={`AGENT          SESSIONS   TOKENS        ESTIMATED COST
claude-code    4          1,247,800     $4.82
cursor         7          892,100       $2.14
codex          2          341,500       $1.02
─────────────────────────────────────────────────
TOTAL          13         2,481,400     $7.98

DAILY AVG (7d)  $6.41     MONTHLY PROJ   $192.30`}
        />
      </section>

      {/* Hallucination Detection */}
      <section id="hallucination-detection" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Hallucination Detection
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Agents sometimes import modules that don&apos;t exist, call functions
          with wrong signatures, or reference APIs that were deprecated three
          versions ago. Vigil catches these patterns by cross&ndash;referencing
          agent output against your actual codebase state.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          <span className="text-[#e4e4e7] font-mono font-semibold">How it works:</span>{" "}
          After an agent writes a file, Vigil&apos;s L3 Trust Intelligence layer
          runs a series of checks: import resolution (do the imported modules
          actually exist?), symbol validation (do referenced functions and types
          exist in the codebase?), and pattern matching against known
          hallucination signatures. Flagged issues appear in the event log and
          the menu bar app with a hallucination warning.
        </p>

        <CodeBlock
          command="vigil log --flags hallucination --limit 3"
          output={`2025-01-15 14:41:22  cursor  WRITE  src/lib/auth.ts
  ⚠ HALLUCINATION: import { verifyToken } from "@/lib/jwt"
    Module @/lib/jwt does not exist in workspace

2025-01-15 14:38:07  codex   WRITE  src/api/users.ts
  ⚠ HALLUCINATION: calling db.users.findUnique()
    Method findUnique not found on users table

2025-01-15 14:35:51  cursor  WRITE  src/utils/format.ts
  ⚠ HALLUCINATION: import { formatDistance } from "date-fns/esm"
    date-fns/esm is deprecated since v3.0`}
        />
      </section>

      {/* Selective Rollback */}
      <section id="selective-rollback" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Selective Rollback
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          When an agent goes off the rails, you need to undo its work without
          losing changes from other agents that were working in parallel. A
          blanket{" "}
          <code className="text-[#22d3ee] text-xs bg-[#0a0a0a] px-1.5 py-0.5 border border-[#2a2e37]">
            git reset
          </code>{" "}
          destroys everything. Vigil&apos;s selective rollback targets only the
          changes from a specific agent session.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          <span className="text-[#e4e4e7] font-mono font-semibold">How it works:</span>{" "}
          Every write event is stored with a before&ndash;and&ndash;after
          snapshot of the affected file region. When you roll back a session,
          Vigil replays the inverse patches in reverse chronological order,
          applying only the diffs attributed to that session. Other agents&apos;
          changes remain intact.
        </p>

        <CodeBlock
          command="vigil rollback --session s_7e1a --dry-run"
          output={`SESSION s_7e1a (cursor, 14:30–14:38)
  Would revert 12 files:
    src/lib/auth.ts           -47 +12
    src/api/users.ts          -31 +8
    src/api/posts.ts          -22 +5
    src/utils/format.ts       -15 +3
    ... and 8 more

  Other agents' changes: preserved
  Run without --dry-run to apply.`}
        />
      </section>
    </>
  )
}
