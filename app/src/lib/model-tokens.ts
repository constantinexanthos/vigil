/**
 * Model name → display tokens. Separate from `formatters.ts::shortModel` because
 * V2a wants uppercase-short (OPUS / GPT-5) plus a family color, and the older
 * helper returns a mixed-case ("Opus") / no-color variant that other surfaces still use.
 */

export function modelShortName(model: string | null | undefined): string {
  if (!model) return "—";
  const m = model.toLowerCase();
  if (m.includes("opus")) return "OPUS";
  if (m.includes("sonnet")) return "SONNET";
  if (m.includes("haiku")) return "HAIKU";
  if (m.includes("gpt-5")) return "GPT-5";
  if (m.includes("gpt-4")) return "GPT-4";
  if (m.includes("codex")) return "CODEX";
  return "MODEL";
}

export function modelLongName(model: string | null | undefined): string {
  if (!model) return "Unknown";
  const m = model.toLowerCase();
  // Strip date suffix like "-20260501" from Claude model ids.
  const stripped = m.replace(/-\d{8}$/, "");
  const claude = stripped.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) {
    const [, family, major, minor] = claude;
    const pretty = family.charAt(0).toUpperCase() + family.slice(1);
    return `Claude ${pretty} ${major}.${minor}`;
  }
  if (stripped === "codex") return "CODEX";
  if (stripped === "gpt-5-codex") return "GPT-5 CODEX";
  if (stripped.startsWith("gpt-")) return stripped.toUpperCase();
  return model;
}

export function modelFamilyColor(model: string | null | undefined): string {
  if (!model) return "#6b7084";
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku")) {
    return "#a78bfa";
  }
  if (m.includes("gpt") || m.includes("codex")) return "#f472b6";
  return "#6b7084";
}
