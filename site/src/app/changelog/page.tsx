"use client"

import { motion } from "framer-motion"
import { Nav } from "@/components/nav"
import { Footer } from "@/components/footer"

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
}

const shipped = [
  {
    date: "April 2026",
    title: "Cost Intelligence",
    bullets: [
      "Token usage tracking and burn rate per agent, session, day",
      "Automatic cost extraction from hook metadata",
      "Model-aware estimation (Opus, Sonnet, Haiku pricing)",
      "vigil cost CLI with --agent, --since, --sessions flags",
    ],
  },
  {
    date: "April 2026",
    title: "Confidence Scoring",
    bullets: [
      "Trust scoring engine (0\u2013100) for agent output quality",
      "7 heuristics: scope, self-correction, tests, diversity, diffs, collisions, commits",
      "Live scores in AgentOrb cards (green/amber/red)",
    ],
  },
  {
    date: "April 2026",
    title: "Real-time Streaming",
    bullets: [
      "Background thread polls SQLite for new events",
      "Tauri event push replaces 5s polling",
      "Live animations for new events, scores, and collisions",
    ],
  },
  {
    date: "April 2026",
    title: "Claude Code Hooks",
    bullets: [
      "Native hooks API integration",
      "Structured events for tool calls, file edits, commands",
      "Automatic registration via vigil init",
    ],
  },
  {
    date: "April 2026",
    title: "Marketing Site",
    bullets: [
      "Next.js site with animated raining letters hero",
      "Feature showcase, terminal demo, docs, changelog",
    ],
  },
  {
    date: "April 2026",
    title: "Menu Bar App",
    bullets: [
      "Tauri v2 menu bar app with hacker HUD aesthetic",
      "AgentOrb cards with sparklines and cost display",
      "CollisionBanner with real-time alerts",
    ],
  },
  {
    date: "April 2026",
    title: "Core Daemon",
    bullets: [
      "File watcher, git monitoring, process detection",
      "SQLite store, CLI interface",
      "Collision detection for multi-agent file conflicts",
    ],
  },
]

const comingSoon = [
  {
    title: "Hallucination Detection",
    status: "Planned" as "Planned" | "In Progress",
    description: "Import/require verification for phantom dependencies",
  },
  {
    title: "Selective Rollback",
    status: "Planned" as "Planned" | "In Progress",
    description: "Per-file accept/reject after agent sessions",
  },
  {
    title: "Multi-machine Support",
    status: "Planned" as "Planned" | "In Progress",
    description: "Monitor agents across multiple development machines",
  },
]

export default function ChangelogPage() {
  return (
    <>
      <Nav />
      <div className="min-h-screen pt-[64px]">
        <div className="mx-auto max-w-4xl px-6 py-16">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" as const }}
            className="mb-14"
          >
            <span
              className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
              style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
            >
              // changelog
            </span>
            <h1 className="text-2xl font-bold text-[#e4e4e7] font-mono mb-2">
              What we{"\u2019"}re building
            </h1>
            <p className="text-sm text-[#6b7084] max-w-lg">
              A running log of what{"\u2019"}s shipped and what{"\u2019"}s next
              {"\u2013"} newest first.
            </p>
          </motion.div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Left column: Shipped */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <motion.div variants={itemVariants} className="flex items-center gap-2 mb-6">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <h2 className="text-sm font-bold text-[#e4e4e7] font-mono uppercase tracking-[0.1em]">
                  Shipped
                </h2>
              </motion.div>

              <div className="flex flex-col">
                {shipped.map((entry, i) => (
                  <motion.div
                    key={entry.title}
                    variants={itemVariants}
                    className={`pb-5 mb-5 ${
                      i < shipped.length - 1
                        ? "border-b border-[#1a1d23]"
                        : ""
                    }`}
                  >
                    <span className="block text-[#6b7084] font-mono text-xs mb-1">
                      {entry.date}
                    </span>
                    <span className="block text-[#e4e4e7] font-mono font-bold text-sm mb-2">
                      {entry.title}
                    </span>
                    <ul className="flex flex-col gap-1">
                      {entry.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="text-xs text-[#6b7084] font-mono flex items-start gap-2"
                        >
                          <span className="text-[#3d4150] leading-[1.6]">
                            &#8226;
                          </span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right column: Coming Soon */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <motion.div variants={itemVariants} className="flex items-center gap-2 mb-6">
                <span className="inline-block w-2 h-2 rounded-full bg-[#22d3ee]" />
                <h2 className="text-sm font-bold text-[#e4e4e7] font-mono uppercase tracking-[0.1em]">
                  Coming Soon
                </h2>
              </motion.div>

              <div className="flex flex-col gap-3">
                {comingSoon.map((entry) => (
                  <motion.div
                    key={entry.title}
                    variants={itemVariants}
                    className={`bg-[#0d0f12] border border-[#1a1d23] rounded-md p-4 ${
                      entry.status === "In Progress"
                        ? "border-l-2 border-l-[#22d3ee]"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#e4e4e7] font-mono font-bold text-sm">
                        {entry.title}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border rounded ${
                          entry.status === "In Progress"
                            ? "text-[#22d3ee] border-[#22d3ee]/30"
                            : "text-[#6b7084] border-[#2a2e37]"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#6b7084] font-mono">
                      {entry.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Footer CTA */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: "easeOut" as const }}
            className="mt-16 text-center"
          >
            <a
              href="https://github.com/constantinexanthos/vigil"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-mono text-xs text-[#6b7084] border border-[#2a2e37] rounded px-5 py-2.5 transition-colors hover:text-[#22d3ee] hover:border-[#22d3ee]/40"
            >
              See the full commit history on GitHub
            </a>
          </motion.div>
        </div>
      </div>
      <Footer />
    </>
  )
}
