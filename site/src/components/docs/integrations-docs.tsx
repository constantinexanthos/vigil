"use client"

import { CodeBlock } from "./code-block"

interface Integration {
  id: string
  name: string
  method: string
  depth: string
  depthColor: string
  description: string
  setup?: string
}

const integrations: Integration[] = [
  {
    id: "int-claude-code",
    name: "Claude Code",
    method: "Native hooks API + FS watcher",
    depth: "deep",
    depthColor: "text-[#22d3ee]",
    description:
      "The deepest integration available. Vigil connects directly to Claude Code\u2019s hooks API, capturing prompt context, tool calls, token counts, model selection, and error states in addition to filesystem events. This gives Vigil full visibility into what the agent is thinking, not just what it\u2019s writing.",
    setup: "vigil hook init",
  },
  {
    id: "int-cursor",
    name: "Cursor",
    method: "Extension API + FS watcher",
    depth: "rich",
    depthColor: "text-[#4ade80]",
    description:
      "Vigil detects Cursor through its process signature and monitors its file operations via the filesystem watcher. The extension API integration captures additional metadata including active file context, applied edits, and composer session boundaries. No manual setup required \u2014 Vigil detects Cursor automatically when it starts.",
  },
  {
    id: "int-codex",
    name: "Codex",
    method: "OpenTelemetry collector",
    depth: "rich",
    depthColor: "text-[#4ade80]",
    description:
      "OpenAI Codex emits OpenTelemetry traces that Vigil\u2019s built-in OTLP collector ingests automatically. This provides structured span data including token usage, model calls, and tool invocations. Combined with filesystem monitoring, Vigil reconstructs a complete timeline of Codex\u2019s actions.",
  },
  {
    id: "int-conductor",
    name: "Conductor",
    method: "Worktree detection + process scan",
    depth: "rich",
    depthColor: "text-[#4ade80]",
    description:
      "Conductor orchestrates multiple agents across git worktrees. Vigil detects worktree creation and monitors each branch independently, attributing file changes to the correct Conductor-managed agent. Process scanning identifies the parent Conductor process and its child agents for accurate session grouping.",
  },
  {
    id: "int-aider",
    name: "Aider",
    method: "FS watcher + git monitor",
    depth: "moderate",
    depthColor: "text-[#6b7084]",
    description:
      "Aider works primarily through git commits, making it straightforward for Vigil to track. The filesystem watcher captures file edits in real time, while the git monitor detects Aider\u2019s characteristic commit patterns to attribute changes and reconstruct session boundaries.",
  },
  {
    id: "int-generic",
    name: "Generic",
    method: "FS watcher + process detection",
    depth: "universal",
    depthColor: "text-[#6b7084]",
    description:
      "Any process that modifies files in a watched directory is captured, even if Vigil doesn\u2019t have a specific integration for it. Process detection identifies the program name and PID, while the filesystem watcher records every read and write. This is the L1 Universal Capture layer \u2014 it works with everything, automatically.",
  },
]

export function IntegrationsDocs() {
  return (
    <>
      {integrations.map((integration, i) => (
        <section
          key={integration.id}
          id={integration.id}
          className="mb-16 scroll-mt-20"
        >
          {i === 0 && (
            <span
              className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
              style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
            >
              // integrations
            </span>
          )}

          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-xl font-bold text-[#e4e4e7] font-mono">
              {integration.name}
            </h3>
            <span className="text-[#6b7084] text-xs font-mono border border-[#2a2e37] px-2 py-0.5 bg-[#0a0a0a]">
              {integration.method}
            </span>
            <span
              className={`text-xs font-mono font-semibold ${integration.depthColor}`}
              style={
                integration.depth === "deep"
                  ? { textShadow: "0 0 6px rgba(34, 211, 238, 0.3)" }
                  : integration.depth === "rich"
                  ? { textShadow: "0 0 6px rgba(74, 222, 128, 0.3)" }
                  : undefined
              }
            >
              {integration.depth}
            </span>
          </div>

          <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
            {integration.description}
          </p>

          {integration.setup && (
            <>
              <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-2">
                <span className="text-[#e4e4e7] font-mono font-semibold">Setup:</span>{" "}
                Run the hook installer to enable deep integration:
              </p>
              <CodeBlock
                command={integration.setup}
                output={`[vigil] scanning for supported agents...
[vigil] found: claude-code
[vigil] installed hooks:
  ~/.claude/hooks/pre-tool-use.sh   → vigil event capture
  ~/.claude/hooks/post-tool-use.sh  → vigil result capture
  ~/.claude/hooks/on-error.sh       → vigil error tracking
[vigil] hooks active — claude-code integration: deep`}
              />
            </>
          )}
        </section>
      ))}
    </>
  )
}
