"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Eye,
  GitCompareArrows,
  Gauge,
  DollarSign,
  Bug,
  RotateCcw,
} from "lucide-react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface FeatureItem {
  title: string
  icon: LucideIcon
  desc: string
}

const items: FeatureItem[] = [
  {
    title: "Universal Capture",
    icon: Eye,
    desc: "Watches every file change, git operation, and process on your machine. Any agent, any terminal, zero config.",
  },
  {
    title: "Collision Detection",
    icon: GitCompareArrows,
    desc: "Alerts when two agents modify the same file within 5 minutes. Catches conflicts before PRs exist.",
  },
  {
    title: "Confidence Scoring",
    icon: Gauge,
    desc: "Scores agent output 0\u2013100 based on file count, import resolution, test coverage, and self-correction patterns.",
  },
  {
    title: "Cost Intelligence",
    icon: DollarSign,
    desc: "Tracks token usage and spend across providers. See burn rate per agent, per session, per day.",
  },
  {
    title: "Hallucination Detection",
    icon: Bug,
    desc: "Verifies every import and require resolves to a real module. Catches phantom dependencies before they ship.",
  },
  {
    title: "Selective Rollback",
    icon: RotateCcw,
    desc: "Accept or reject changes per-file after any agent session. Interactive TUI for surgical undo.",
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
}

export function DarkFeatureGrid() {
  return (
    <section id="features" className="w-full bg-[#07080a] py-20 md:py-32 border-t border-[#1a1d23]">
      <div className="mx-auto max-w-4xl px-6">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // features
        </span>
        <h2 className="text-xl font-bold text-[#e4e4e7] font-mono mb-3">
          See everything your agents do
        </h2>
        <p className="text-sm text-[#6b7084] mb-10 max-w-lg">
          Six capabilities that give you full visibility and control over
          AI-generated code.
        </p>

        <motion.div
          className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {items.map(({ title, icon: Icon, desc }) => (
            <motion.div key={title} variants={itemVariants}>
              <Card className="group relative overflow-visible rounded-none border-[#1a1d23] bg-[#0d0f12] p-0 transition-all duration-300 hover:border-[#22d3ee] hover:shadow-[0_0_8px_rgba(34,211,238,0.1),inset_0_0_8px_rgba(34,211,238,0.02)]">
                {/* Corner decorators on hover */}
                <div className="pointer-events-none absolute inset-0 hidden group-hover:block">
                  <div className="absolute -left-px -top-px h-2 w-2 border-l-2 border-t-2 border-[#22d3ee]" />
                  <div className="absolute -right-px -top-px h-2 w-2 border-r-2 border-t-2 border-[#22d3ee]" />
                  <div className="absolute -bottom-px -left-px h-2 w-2 border-b-2 border-l-2 border-[#22d3ee]" />
                  <div className="absolute -bottom-px -right-px h-2 w-2 border-b-2 border-r-2 border-[#22d3ee]" />
                </div>

                <CardHeader className="relative z-10 flex flex-row items-start gap-3 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-none border border-[#2a2e37] bg-[#07080a] text-[#6b7084] transition-colors group-hover:border-[#22d3ee]/40 group-hover:text-[#22d3ee]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm font-semibold text-[#e4e4e7] font-mono">
                      {title}
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="relative z-10 px-6 pb-6 text-[13px] text-[#6b7084] leading-relaxed">
                  {desc}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
