"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Menu, X } from "lucide-react"

interface SidebarSection {
  label: string
  items: { id: string; title: string }[]
}

const sections: SidebarSection[] = [
  {
    label: "getting started",
    items: [
      { id: "installation", title: "Installation" },
      { id: "quick-start", title: "Quick Start" },
      { id: "configuration", title: "Configuration" },
    ],
  },
  {
    label: "concepts",
    items: [
      { id: "universal-capture", title: "Universal Capture" },
      { id: "collision-detection", title: "Collision Detection" },
      { id: "confidence-scoring", title: "Confidence Scoring" },
      { id: "cost-intelligence", title: "Cost Intelligence" },
      { id: "hallucination-detection", title: "Hallucination Detection" },
      { id: "selective-rollback", title: "Selective Rollback" },
    ],
  },
  {
    label: "cli reference",
    items: [
      { id: "vigil-watch", title: "vigil watch" },
      { id: "vigil-status", title: "vigil status" },
      { id: "vigil-log", title: "vigil log" },
      { id: "vigil-cost", title: "vigil cost" },
      { id: "vigil-hook", title: "vigil hook" },
    ],
  },
  {
    label: "integrations",
    items: [
      { id: "int-claude-code", title: "Claude Code" },
      { id: "int-cursor", title: "Cursor" },
      { id: "int-codex", title: "Codex" },
      { id: "int-conductor", title: "Conductor" },
      { id: "int-aider", title: "Aider" },
      { id: "int-generic", title: "Generic" },
    ],
  },
  {
    label: "architecture",
    items: [
      { id: "three-layers", title: "Three Layers" },
      { id: "data-model", title: "Data Model" },
      { id: "menu-bar-app", title: "Menu Bar App" },
    ],
  },
]

export function DocsSidebar() {
  const [activeId, setActiveId] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const ids = sections.flatMap((s) => s.items.map((i) => i.id))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    )

    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  const handleClick = (id: string) => {
    setMobileOpen(false)
    const el = document.getElementById(id)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top, behavior: "smooth" })
    }
  }

  const sidebarContent = (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.label}>
          <span
            className="block text-[#22d3ee] text-[10px] uppercase tracking-[0.15em] font-mono mb-2"
            style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.25)" }}
          >
            // {section.label}
          </span>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleClick(item.id)}
                  className={cn(
                    "block w-full text-left text-[13px] font-mono px-3 py-1 border-l-2 transition-all",
                    activeId === item.id
                      ? "text-[#e4e4e7] border-[#22d3ee]"
                      : "text-[#6b7084] border-transparent hover:text-[#e4e4e7] hover:border-[#2a2e37]"
                  )}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-[72px] left-4 z-40 p-2 bg-[#0d0f12] border border-[#2a2e37] text-[#6b7084]"
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 top-[64px] z-30 bg-[rgba(7,8,10,0.9)]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-[64px] left-0 h-[calc(100vh-64px)] w-[240px] border-r border-[#1a1d23] bg-[#07080a] overflow-y-auto p-6 z-30 transition-transform",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
