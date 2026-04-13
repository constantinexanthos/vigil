"use client"

import { motion } from "framer-motion"

const steps = [
  {
    num: "1",
    cmd: "brew install vigil",
    desc: "Single binary. 5MB. Zero dependencies.",
  },
  {
    num: "2",
    cmd: "vigil watch ~/projects",
    desc: "Daemon starts. Watches filesystem, git, and processes.",
  },
  {
    num: "3",
    cmd: "Start working.",
    desc: "Launch Claude Code, open Cursor, spin up Conductor. Everything captured.",
  },
  {
    num: "4",
    cmd: "vigil status",
    desc: "Active agents, files touched, collision warnings, burn rate. Menu bar always visible.",
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="w-full bg-[#07080a] py-20 border-t border-[#1a1d23]">
      <div className="mx-auto max-w-4xl px-6">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // how it works
        </span>
        <h2 className="text-xl font-bold text-[#e4e4e7] font-mono mb-3">
          30 seconds to full visibility
        </h2>
        <p className="text-sm text-[#6b7084] mb-10 max-w-lg">
          No config files. No API keys. No cloud accounts. Install and go.
        </p>

        <div className="flex flex-col gap-[2px]">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * (i + 1), duration: 0.4, ease: "easeOut" }}
              className="group bg-[#0d0f12] border border-[#2a2e37] p-5 flex gap-5 items-baseline transition-all duration-200 hover:border-[#22d3ee] hover:shadow-[0_0_8px_rgba(34,211,238,0.1),inset_0_0_8px_rgba(34,211,238,0.02)]"
            >
              <span
                className="text-[#22d3ee] font-bold text-lg font-mono min-w-[28px]"
                style={{ textShadow: "0 0 8px rgba(34, 211, 238, 0.4)" }}
              >
                {step.num}
              </span>
              <div>
                <div className="text-[#e4e4e7] font-semibold font-mono mb-1">
                  {step.cmd}
                </div>
                <div className="text-[#6b7084] text-[13px]">{step.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
