/**
 * Shared display formatters. Pulled out of individual components to stop
 * humanModel/repoName/etc. from drifting across three files.
 */

export function repoName(path: string | null | undefined): string {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * "Claude Opus", "GPT-5" — longer form used in dense UI (footer, summary).
 */
export function humanModel(m: string | null | undefined): string {
  if (!m) return "unknown";
  if (m.includes("opus")) return "Claude Opus";
  if (m.includes("sonnet")) return "Claude Sonnet";
  if (m.includes("haiku")) return "Claude Haiku";
  if (m.includes("gpt-5")) return "GPT-5";
  if (m.includes("gpt")) return "GPT";
  return m;
}

/**
 * "Opus", "GPT" — short form for tight spots like the left-rail session card.
 */
export function shortModel(m: string | null | undefined): string {
  if (!m) return "";
  if (m.includes("opus")) return "Opus";
  if (m.includes("sonnet")) return "Sonnet";
  if (m.includes("haiku")) return "Haiku";
  if (m.includes("gpt")) return "GPT";
  return m.split("-")[0] ?? "";
}

export function elapsedSince(startIso: string): string {
  const start = new Date(startIso).getTime();
  const ms = Math.max(0, Date.now() - start);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function relativeTimeFromIso(iso: string): string {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
