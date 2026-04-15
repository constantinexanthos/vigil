"use client"

import { CodeBlock } from "./code-block"

const layers = [
  {
    num: "L3",
    name: "Trust Intelligence",
    tech: "Confidence + Hallucination + Collision",
    description:
      "The highest layer analyzes agent behavior for trustworthiness. It scores session confidence based on read/write ratios and test coverage, detects hallucinated imports and function calls by cross-referencing against the actual codebase, and flags collisions when multiple agents edit overlapping files. This layer turns raw events into actionable judgments.",
  },
  {
    num: "L2",
    name: "Deep Hooks",
    tech: "Claude Code + Cursor + OTLP",
    description:
      "Agent-specific integrations that go beyond filesystem observation. Claude Code\u2019s native hooks API provides prompt context, tool calls, and token counts. Cursor\u2019s extension API surfaces composer sessions and edit metadata. OpenTelemetry collectors ingest structured traces from Codex and other OTLP-emitting agents. Not every agent supports L2 \u2014 but those that do give Vigil significantly richer data.",
  },
  {
    num: "L1",
    name: "Universal Capture",
    tech: "FS events + Git + Process detection",
    description:
      "The foundation layer that works with every agent, out of the box. Filesystem watchers (FSEvents on macOS, inotify on Linux) capture every file create, write, and delete. Process scanning identifies which running program owns each change. Git monitoring tracks commits and branch operations. This layer alone provides full visibility \u2014 the upper layers add depth.",
  },
]

export function ArchitectureDocs() {
  return (
    <>
      {/* Three Layers */}
      <section id="three-layers" className="mb-16 scroll-mt-20">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // architecture
        </span>
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Three Layers
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Vigil&apos;s architecture is a three&ndash;layer stack. Each layer
          builds on the one below it. L1 works universally with zero
          configuration. L2 and L3 activate automatically when deeper
          integrations are available.
        </p>

        <div className="flex flex-col gap-[2px] mb-8">
          {layers.map((layer) => (
            <div
              key={layer.num}
              className="bg-[#0d0f12] border border-[#2a2e37] p-5"
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-4">
                  <span
                    className="text-[#22d3ee] font-bold text-xs font-mono min-w-[24px]"
                    style={{ textShadow: "0 0 6px rgba(34, 211, 238, 0.3)" }}
                  >
                    {layer.num}
                  </span>
                  <span className="text-[#e4e4e7] font-semibold text-[13px] font-mono">
                    {layer.name}
                  </span>
                </div>
                <span className="text-[#6b7084] text-xs font-mono hidden sm:block">
                  {layer.tech}
                </span>
              </div>
              <p className="text-[#6b7084] text-sm font-sans leading-relaxed pl-10">
                {layer.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Data Model */}
      <section id="data-model" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Data Model
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          All data lives in a single SQLite database at{" "}
          <code className="text-[#22d3ee] text-xs bg-[#0a0a0a] px-1.5 py-0.5 border border-[#2a2e37]">
            ~/.vigil/vigil.db
          </code>
          . No cloud, no network calls, no external dependencies. Both the CLI
          and the menu bar app query this file directly.
        </p>

        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          The schema centers on two core tables:
        </p>

        <div className="flex flex-col gap-[2px] mb-6">
          <div className="bg-[#0d0f12] border border-[#2a2e37] p-5">
            <div className="flex items-center gap-3 mb-2">
              <span
                className="text-[#22d3ee] font-mono font-bold text-xs"
                style={{ textShadow: "0 0 6px rgba(34, 211, 238, 0.3)" }}
              >
                events
              </span>
              <span className="text-[#6b7084] text-xs font-mono">
                primary event stream
              </span>
            </div>
            <p className="text-[#6b7084] text-sm font-sans leading-relaxed">
              Every file operation &mdash; reads, writes, creates, deletes &mdash;
              with timestamps, agent attribution, session ID, file path, and
              optional metadata from L2 hooks. This table grows the fastest and
              is the source of truth for everything else.
            </p>
          </div>

          <div className="bg-[#0d0f12] border border-[#2a2e37] p-5">
            <div className="flex items-center gap-3 mb-2">
              <span
                className="text-[#22d3ee] font-mono font-bold text-xs"
                style={{ textShadow: "0 0 6px rgba(34, 211, 238, 0.3)" }}
              >
                cost_events
              </span>
              <span className="text-[#6b7084] text-xs font-mono">
                token usage and cost tracking
              </span>
            </div>
            <p className="text-[#6b7084] text-sm font-sans leading-relaxed">
              Records token usage and estimated costs per agent session. Populated
              by L2 hooks that capture model, token counts, and pricing data from
              supported agents.
            </p>
          </div>
        </div>

        <CodeBlock
          command="sqlite3 ~/.vigil/vigil.db '.tables'"
          output={`cost_events  events`}
        />
      </section>

      {/* Menu Bar App */}
      <section id="menu-bar-app" className="mb-16 scroll-mt-20">
        <h3 className="text-xl font-bold text-[#e4e4e7] font-mono mb-4">
          Menu Bar App
        </h3>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          The Vigil menu bar app is a native macOS application built with
          Tauri v2 and React. It sits in your menu bar and provides a persistent,
          always&ndash;visible window into agent activity without touching the
          terminal.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          The app reads directly from the daemon&apos;s SQLite database &mdash;
          same file, same data, no API layer in between. It uses the same dark
          theme as the CLI output and this documentation site: dark backgrounds,
          cyan accents, monospace typography.
        </p>
        <p className="text-[#6b7084] text-sm font-sans leading-relaxed mb-4">
          Key features of the menu bar app:
        </p>

        <div className="flex flex-col gap-[2px] mb-6">
          <div className="bg-[#0d0f12] border border-[#2a2e37] p-5">
            <span className="text-[#e4e4e7] font-semibold text-[13px] font-mono block mb-2">
              Live agent status
            </span>
            <p className="text-[#6b7084] text-sm font-sans leading-relaxed">
              See which agents are currently active, their session IDs, file
              counts, and collision state &mdash; updated in real time as the
              daemon processes events.
            </p>
          </div>

          <div className="bg-[#0d0f12] border border-[#2a2e37] p-5">
            <span className="text-[#e4e4e7] font-semibold text-[13px] font-mono block mb-2">
              Collision alerts
            </span>
            <p className="text-[#6b7084] text-sm font-sans leading-relaxed">
              Desktop notifications when collisions are detected, with
              one&ndash;click navigation to the affected files and sessions.
            </p>
          </div>

          <div className="bg-[#0d0f12] border border-[#2a2e37] p-5">
            <span className="text-[#e4e4e7] font-semibold text-[13px] font-mono block mb-2">
              Cost dashboard
            </span>
            <p className="text-[#6b7084] text-sm font-sans leading-relaxed">
              Running token spend by agent with daily and monthly projections,
              mirroring the{" "}
              <code className="text-[#22d3ee] text-xs bg-[#0a0a0a] px-1.5 py-0.5 border border-[#2a2e37]">
                vigil cost
              </code>{" "}
              command in a visual format.
            </p>
          </div>
        </div>

        <CodeBlock
          command="vigil app --version"
          output={`vigil-app 0.4.1 (tauri 2.1.0, react 19.0.0)
backend: ~/.vigil/vigil.db
theme: dark`}
        />
      </section>
    </>
  )
}
