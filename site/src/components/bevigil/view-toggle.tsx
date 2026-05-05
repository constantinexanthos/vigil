"use client"

import { usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import type { ViewMode } from "./view"

// Sycamore-style human | agent toggle.
// Persists the active mode via the ?view= search param so each linked
// page in the site preserves the user's choice. Server components read
// the same param via resolveViewFromSearchParams() in view.ts and render
// the appropriate view.

export function ViewToggle({
  className = "",
}: {
  className?: string
}) {
  const pathname = usePathname() ?? "/"
  const params = useSearchParams()
  const current: ViewMode = params?.get("view") === "agent" ? "agent" : "human"

  // Build href that switches mode while preserving everything else.
  function hrefFor(mode: ViewMode) {
    const next = new URLSearchParams(params?.toString() ?? "")
    if (mode === "agent") {
      next.set("view", "agent")
    } else {
      next.delete("view")
    }
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <div
      role="group"
      aria-label="Choose view"
      className={`inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-medium ${className}`}
    >
      <ToggleItem
        href={hrefFor("human")}
        active={current === "human"}
        label="human"
      />
      <span aria-hidden className="text-stone-300">
        |
      </span>
      <ToggleItem
        href={hrefFor("agent")}
        active={current === "agent"}
        label="agent"
      />
    </div>
  )
}

function ToggleItem({
  href,
  active,
  label,
}: {
  href: string
  active: boolean
  label: string
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 transition-colors"
      style={{ color: active ? "#0c0a09" : "#a8a29e" }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-[1px]"
        style={{
          background: active ? "#0891b2" : "transparent",
          border: active ? "none" : "1px solid #d6d3d1",
        }}
      />
      <span>{label}</span>
    </Link>
  )
}

