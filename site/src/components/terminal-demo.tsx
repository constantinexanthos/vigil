"use client"

import { motion } from "framer-motion"

interface TerminalLine {
  content: React.ReactNode
  delay: number
}

const lines: TerminalLine[] = [
  {
    content: (
      <>
        <span className="text-[#22d3ee]" style={{ textShadow: "0 0 6px rgba(34, 211, 238, 0.4)" }}>$</span>
        {" "}vigil status
      </>
    ),
    delay: 0.2,
  },
  { content: "\u00A0", delay: 0.8 },
  { content: <span className="text-[#6b7084]">AGENTS</span>, delay: 1.0 },
  {
    content: <span className="text-[#3d4150]">{"─".repeat(40)}</span>,
    delay: 1.2,
  },
  {
    content: (
      <>
        {"  "}
        <span className="text-[#22d3ee] font-semibold">claude-code</span>
        <span className="text-[#6b7084]">{"    pid 41823   ~/projects/vigil      12 events"}</span>
      </>
    ),
    delay: 1.6,
  },
  {
    content: (
      <>
        {"  "}
        <span className="text-[#22d3ee] font-semibold">cursor</span>
        <span className="text-[#6b7084]">{"          pid 9102    ~/projects/vigil      8 events"}</span>
      </>
    ),
    delay: 2.0,
  },
  {
    content: (
      <>
        {"  "}
        <span className="text-[#22d3ee] font-semibold">codex</span>
        <span className="text-[#6b7084]">{"           pid 55201   ~/projects/api        3 events"}</span>
      </>
    ),
    delay: 2.4,
  },
  { content: "\u00A0", delay: 3.0 },
  {
    content: <span className="text-[#6b7084]">COLLISIONS (last 5 min)</span>,
    delay: 3.2,
  },
  {
    content: <span className="text-[#3d4150]">{"─".repeat(40)}</span>,
    delay: 3.4,
  },
  {
    content: (
      <>
        {"  "}
        <span className="text-[#fbbf24]" style={{ textShadow: "0 0 8px rgba(251, 191, 36, 0.3)" }}>
          src/api/auth.ts
        </span>
        <span className="text-[#6b7084]">{" -- ["}</span>
        <span className="text-[#22d3ee] font-semibold">claude-code</span>
        <span className="text-[#6b7084]">, </span>
        <span className="text-[#22d3ee] font-semibold">cursor</span>
        <span className="text-[#6b7084]">]</span>
      </>
    ),
    delay: 3.8,
  },
  { content: "\u00A0", delay: 4.4 },
  {
    content: (
      <>
        <span className="text-[#22d3ee]" style={{ textShadow: "0 0 6px rgba(34, 211, 238, 0.4)" }}>$</span>
        {" "}
        <span className="animate-pulse">_</span>
      </>
    ),
    delay: 4.6,
  },
]

export function TerminalDemo() {
  return (
    <section className="w-full bg-[#07080a] py-20 border-t border-[#1a1d23]">
      <div className="mx-auto max-w-4xl px-6">
        <div
          className="font-mono bg-[#0d0f12] border border-[#2a2e37] overflow-hidden"
          style={{
            boxShadow:
              "0 0 30px rgba(34, 211, 238, 0.03), 0 4px 60px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Terminal bar */}
          <div className="bg-[#0a0b0d] px-4 py-2.5 flex items-center gap-2 border-b border-[#1a1d23]">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            <span className="text-[#6b7084] text-xs ml-2">vigil status</span>
          </div>

          {/* Terminal body */}
          <div className="p-5 text-[13px] leading-[1.8]">
            {lines.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: line.delay, duration: 0.3, ease: "easeOut" }}
              >
                {line.content}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
