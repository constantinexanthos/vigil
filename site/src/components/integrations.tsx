"use client"

import { motion } from "framer-motion"

const chips = [
  "Claude Code",
  "Cursor",
  "Codex",
  "Conductor",
  "Aider",
  "Claude Squad",
  "Cline",
  "Any Terminal",
]

const agents = [
  { name: "Claude Code", method: "Native hooks API + FS watcher", depth: "deep", depthClass: "text-[#22d3ee]" },
  { name: "Cursor", method: "Extension API + FS watcher", depth: "rich", depthClass: "text-[#4ade80]" },
  { name: "Conductor", method: "Worktree detection + process scan", depth: "rich", depthClass: "text-[#4ade80]" },
  { name: "OpenAI Codex", method: "OpenTelemetry collector", depth: "rich", depthClass: "text-[#4ade80]" },
  { name: "Aider", method: "FS watcher + git monitor", depth: "moderate", depthClass: "text-[#6b7084]" },
  { name: "Cline / Roo", method: "FS watcher + process detection", depth: "moderate", depthClass: "text-[#6b7084]" },
  { name: "Any process", method: "FS watcher + process detection", depth: "universal", depthClass: "text-[#6b7084]" },
]

export function Integrations() {
  return (
    <section id="agents" className="w-full py-20 border-t border-[#1a1d23]">
      <div className="mx-auto max-w-4xl px-6">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          {"// integrations"}
        </span>
        <h2 className="text-xl font-bold text-[#e4e4e7] font-mono mb-3">
          Works with everything
        </h2>
        <p className="text-sm text-[#6b7084] mb-10 max-w-lg">
          If it modifies your code, Vigil sees it. Zero configuration required.
        </p>

        {/* Chips */}
        <motion.div
          className="flex flex-wrap gap-2 mb-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {chips.map((chip) => (
            <motion.div
              key={chip}
              variants={{
                hidden: { opacity: 0, scale: 0.8 },
                visible: { opacity: 1, scale: 1 },
              }}
              className="font-mono text-xs text-[#6b7084] border border-[#1a1d23] px-3.5 py-1.5 transition-all hover:border-[#2a2e37] hover:text-[#e4e4e7]"
            >
              {chip}
            </motion.div>
          ))}
        </motion.div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left font-mono font-medium text-[#6b7084] text-xs uppercase tracking-[0.08em] px-4 py-2.5 border-b border-[#2a2e37]">
                  Agent
                </th>
                <th className="text-left font-mono font-medium text-[#6b7084] text-xs uppercase tracking-[0.08em] px-4 py-2.5 border-b border-[#2a2e37]">
                  Method
                </th>
                <th className="text-left font-mono font-medium text-[#6b7084] text-xs uppercase tracking-[0.08em] px-4 py-2.5 border-b border-[#2a2e37]">
                  Depth
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={agent.name}
                  className="transition-colors hover:bg-[rgba(34,211,238,0.06)]"
                >
                  <td className="font-mono font-medium text-[#e4e4e7] px-4 py-3 border-b border-[#1a1d23]">
                    {agent.name}
                  </td>
                  <td className="text-[#6b7084] px-4 py-3 border-b border-[#1a1d23]">
                    {agent.method}
                  </td>
                  <td className={`font-mono text-xs px-4 py-3 border-b border-[#1a1d23] ${agent.depthClass}`}
                    style={
                      agent.depth === "deep"
                        ? { textShadow: "0 0 6px rgba(34, 211, 238, 0.3)" }
                        : agent.depth === "rich"
                        ? { textShadow: "0 0 6px rgba(74, 222, 128, 0.3)" }
                        : undefined
                    }
                  >
                    {agent.depth}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
