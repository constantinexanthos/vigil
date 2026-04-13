"use client"

import { motion } from "framer-motion"

const layers = [
  {
    num: "L3",
    name: "Trust Intelligence",
    tech: "Confidence + Hallucination + Collision",
  },
  {
    num: "L2",
    name: "Deep Hooks",
    tech: "Claude Code + Cursor + OTLP",
  },
  {
    num: "L1",
    name: "Universal Capture",
    tech: "FS events + Git + Process detection",
  },
]

export function Architecture() {
  return (
    <section className="w-full bg-[#07080a] py-20 border-t border-[#1a1d23]">
      <div className="mx-auto max-w-4xl px-6">
        <span
          className="block text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono mb-3"
          style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
        >
          // architecture
        </span>
        <h2 className="text-xl font-bold text-[#e4e4e7] font-mono mb-3">
          Three layers of intelligence
        </h2>
        <p className="text-sm text-[#6b7084] mb-10 max-w-lg">
          Works with everything out of the box. Gets smarter with each
          integration.
        </p>

        <div className="flex flex-col gap-[2px]">
          {layers.map((layer, i) => (
            <motion.div
              key={layer.num}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * (i + 1), duration: 0.4, ease: "easeOut" }}
              className="group bg-[#0d0f12] border border-[#2a2e37] p-5 flex justify-between items-center transition-all duration-200 hover:border-[#22d3ee] hover:bg-[rgba(34,211,238,0.06)] hover:shadow-[0_0_8px_rgba(34,211,238,0.12),0_0_24px_rgba(34,211,238,0.04),inset_0_0_8px_rgba(34,211,238,0.02)] cursor-default"
            >
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
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
