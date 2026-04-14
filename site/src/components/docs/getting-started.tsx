"use client"

import { CodeBlock } from "./code-block"

export function GettingStarted() {
  return (
    <>
      {/* Installation */}
      <section id="installation" className="mb-16 scroll-mt-20">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // getting started
        </span>
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Installation
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Vigil ships as a single static binary &mdash; under 5MB, zero runtime
          dependencies. Install via Homebrew on macOS or Linux.
        </p>

        <CodeBlock
          command="brew install vigil"
          output={`==> Downloading vigil-0.4.1.tar.gz
==> Installing vigil
🍺  /usr/local/bin/vigil -> vigil-0.4.1`}
        />

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Verify the installation:
        </p>

        <CodeBlock
          command="vigil --version"
          output="vigil 0.4.1 (aarch64-apple-darwin)"
        />

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          That&apos;s it. No language runtimes, no Docker, no cloud accounts. The
          binary includes the daemon, CLI, and all detection engines. Works on
          macOS (Apple Silicon + Intel) and Linux (x86_64 + aarch64).
        </p>
      </section>

      {/* Quick Start */}
      <section id="quick-start" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Quick Start
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Four steps to full visibility across every AI agent touching your
          codebase.
        </p>

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-2">
          <span className="text-[#e4e4e7] font-mono font-semibold">Step 1.</span>{" "}
          Start the daemon. It watches your project directory for filesystem
          changes, git activity, and running processes.
        </p>
        <CodeBlock
          command="vigil watch ~/projects"
          output={`[vigil] daemon started (pid 41822)
[vigil] watching ~/projects (recursive)
[vigil] process scanner active
[vigil] ready`}
        />

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-2">
          <span className="text-[#e4e4e7] font-mono font-semibold">Step 2.</span>{" "}
          Launch your agents. Open Claude Code, start Cursor, spin up Conductor
          &mdash; whatever you use. Vigil detects them automatically.
        </p>
        <CodeBlock
          command="claude"
          output={`[vigil] detected agent: claude-code (pid 41930)
[vigil] hooks API connected
[vigil] session s_7f2a started`}
        />

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-2">
          <span className="text-[#e4e4e7] font-mono font-semibold">Step 3.</span>{" "}
          Check status. See every active agent, files they&apos;ve touched, and
          any collision warnings.
        </p>
        <CodeBlock
          command="vigil status"
          output={`AGENTS (2 active)
  claude-code    pid 41930   session s_7f2a   14 files   0 collisions
  cursor         pid 42101   session s_8b3c    6 files   0 collisions

COLLISIONS (0 active)
  No active collisions detected.

UPTIME  1h 12m    EVENTS  847    STORE  2.1 MB`}
        />

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-2">
          <span className="text-[#e4e4e7] font-mono font-semibold">Step 4.</span>{" "}
          Review the event log. Every file touch, edit, and agent action is
          captured with timestamps and attribution.
        </p>
        <CodeBlock
          command="vigil log --limit 5"
          output={`2025-01-15 14:23:01  claude-code  WRITE   src/lib/api.ts
2025-01-15 14:22:58  claude-code  WRITE   src/lib/api.ts
2025-01-15 14:22:41  cursor       WRITE   src/components/nav.tsx
2025-01-15 14:22:30  cursor       READ    src/components/nav.tsx
2025-01-15 14:22:12  claude-code  WRITE   src/lib/utils.ts`}
        />
      </section>

      {/* Configuration */}
      <section id="configuration" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Configuration
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Vigil works with zero configuration. The daemon uses sensible defaults
          &mdash; watch the current directory, detect all known agents, alert on
          collisions within a 30&ndash;second window.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          For advanced tuning, create an optional config file at{" "}
          <code className="text-[#22d3ee] text-xs bg-[#0a0a0a] px-1.5 py-0.5 border border-[#2a2e37]">
            ~/.config/vigil/config.toml
          </code>
          :
        </p>

        <CodeBlock
          title="~/.config/vigil/config.toml"
          output={`# Directories to watch (default: current directory)
watch_paths = [
  "~/projects",
  "~/work",
]

# Patterns to ignore
ignore_patterns = [
  "node_modules",
  ".git/objects",
  "target",
  "dist",
  "*.lock",
]

# Seconds within which overlapping edits count as a collision
collision_window = 30

# Desktop notifications for collisions
[notifications]
enabled = true
sound = false`}
        />

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          All fields are optional. Any value you omit falls back to the built&ndash;in
          default. The daemon picks up config changes automatically &mdash; no
          restart required.
        </p>
      </section>
    </>
  )
}
