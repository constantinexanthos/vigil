// Pure server-safe helpers for the human/agent view toggle.
// Lives in its own module so server components can import from here without
// pulling the "use client" boundary that view-toggle.tsx defines.

export type ViewMode = "human" | "agent"

export function resolveViewFromSearchParams(
  searchParams: Record<string, string | string[] | undefined> | undefined
): ViewMode {
  const value = searchParams?.view
  if (Array.isArray(value)) {
    return value[0] === "agent" ? "agent" : "human"
  }
  return value === "agent" ? "agent" : "human"
}
