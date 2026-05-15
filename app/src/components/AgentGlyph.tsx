/**
 * Per-agent glyph: real brand SVG (claude, cursor, openai, copilot, windsurf)
 * for the major agents, letter monogram for smaller projects (aider, cline,
 * conductor), colored-dot fallback for unknown agents.
 *
 * Logos are sourced from simple-icons (CC0) — see lib/agent-logos.ts. We
 * render them in each agent's accent color (defined here) rather than the
 * brand's native fill, so the dashboard's color palette stays disciplined
 * while the silhouette stays accurate.
 */

import { LOGO_PATHS, type LogoKey } from "../lib/agent-logos";

interface AgentGlyphProps {
  agent: string;
  /** Side length in px. Default 16 (rail-row friendly). */
  size?: number;
  /** Optional override label for screen readers. */
  ariaLabel?: string;
}

interface LogoTreatment {
  kind: "logo";
  color: string;
  label: string;
  logo: LogoKey;
}

interface LetterTreatment {
  kind: "letter";
  color: string;
  label: string;
  letter: string;
}

type AgentTreatment = LogoTreatment | LetterTreatment;

const AGENTS: Record<string, AgentTreatment> = {
  "claude-code": { kind: "logo",   color: "#d97757", label: "Claude Code",    logo: "claude" },
  cursor:        { kind: "logo",   color: "#00d9ff", label: "Cursor",         logo: "cursor" },
  codex:         { kind: "logo",   color: "#f472b6", label: "Codex",          logo: "openai" },
  chatgpt:       { kind: "logo",   color: "#10a37f", label: "ChatGPT",        logo: "openai" },
  copilot:       { kind: "logo",   color: "#06b6d4", label: "GitHub Copilot", logo: "githubcopilot" },
  windsurf:      { kind: "logo",   color: "#f59e0b", label: "Windsurf",       logo: "windsurf" },
  conductor:     { kind: "letter", color: "#a78bfa", label: "Conductor",      letter: "C" },
  aider:         { kind: "letter", color: "#ffb800", label: "Aider",          letter: "A" },
  cline:         { kind: "letter", color: "#34d399", label: "Cline",          letter: "C" },
};

const FALLBACK_COLOR = "#6b7084";

export function AgentGlyph({ agent, size = 16, ariaLabel }: AgentGlyphProps) {
  const t = AGENTS[agent];

  if (!t) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-label={ariaLabel ?? agent}
        role="img"
      >
        <circle cx="12" cy="12" r="4" fill={FALLBACK_COLOR} />
      </svg>
    );
  }

  const aria = ariaLabel ?? t.label;

  if (t.kind === "letter") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-label={aria}
        role="img"
      >
        <rect
          x="2.5" y="2.5" width="19" height="19" rx="4"
          stroke={t.color}
          strokeWidth="1.6"
          fill="none"
          opacity="0.55"
        />
        <text
          x="12" y="17"
          fontFamily='"SF Mono", "JetBrains Mono", "IBM Plex Mono", Menlo, monospace'
          fontSize="13"
          fontWeight="700"
          fill={t.color}
          textAnchor="middle"
        >
          {t.letter}
        </text>
      </svg>
    );
  }

  // Real brand logo, recolored to the per-agent accent.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={t.color}
      aria-label={aria}
      role="img"
    >
      <path d={LOGO_PATHS[t.logo]} />
    </svg>
  );
}
