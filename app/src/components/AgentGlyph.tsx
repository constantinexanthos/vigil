/**
 * Inline SVG monogram for an agent. Distinct brand-evocative shapes for
 * known agents (Claude / Cursor / Conductor / Codex), letter monograms for
 * the long tail (Aider / Cline / etc.), and a colored-dot fallback for
 * everything else.
 *
 * Mirrors the modelFamilyColor pattern from `lib/model-tokens.ts` —
 * call-site looks up the visual treatment, the component just renders.
 */

interface AgentGlyphProps {
  agent: string;
  /** Side length in px. Default 16 (rail-row friendly). */
  size?: number;
  /** Optional override label for screen readers. */
  ariaLabel?: string;
}

interface AgentTreatment {
  color: string;
  /** Render kind. "shape" maps to the bespoke per-agent path; "letter" to a monogram. */
  kind: "shape" | "letter" | "fallback";
  /** Human label used for aria-label. */
  label: string;
  /** For "letter" kind, the single character to print. */
  letter?: string;
}

const AGENTS: Record<string, AgentTreatment> = {
  "claude-code": { color: "#d97757", kind: "shape", label: "Claude Code" },
  cursor:        { color: "#00d9ff", kind: "shape", label: "Cursor" },
  conductor:     { color: "#a78bfa", kind: "shape", label: "Conductor" },
  codex:         { color: "#f472b6", kind: "shape", label: "Codex" },
  aider:         { color: "#ffb800", kind: "letter", label: "Aider", letter: "A" },
  cline:         { color: "#34d399", kind: "letter", label: "Cline", letter: "C" },
  chatgpt:       { color: "#10a37f", kind: "letter", label: "ChatGPT", letter: "G" },
  windsurf:      { color: "#f59e0b", kind: "letter", label: "Windsurf", letter: "W" },
};

const FALLBACK_COLOR = "#6b7084";

export function AgentGlyph({ agent, size = 16, ariaLabel }: AgentGlyphProps) {
  const t = AGENTS[agent];

  if (!t) {
    // Fallback: small colored dot inside the same 24-unit viewBox so the
    // call-site can size it interchangeably with the branded shapes.
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

  // Branded shapes — kind === "shape"
  if (agent === "claude-code") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label={aria} role="img">
        <g stroke={t.color} strokeWidth="2.4" strokeLinecap="round">
          <line x1="12" y1="3"  x2="12" y2="21"/>
          <line x1="4.2" y1="7.5"  x2="19.8" y2="16.5"/>
          <line x1="4.2" y1="16.5" x2="19.8" y2="7.5"/>
        </g>
        <circle cx="12" cy="12" r="2.2" fill={t.color}/>
      </svg>
    );
  }

  if (agent === "cursor") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label={aria} role="img">
        <rect x="6.5" y="6.5" width="11" height="11" rx="1.6"
              transform="rotate(45 12 12)"
              stroke={t.color} strokeWidth="2.2"/>
        <rect x="9.8" y="9.8" width="4.4" height="4.4" rx="0.8"
              transform="rotate(45 12 12)"
              fill={t.color}/>
      </svg>
    );
  }

  if (agent === "conductor") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label={aria} role="img">
        <path d="M19.5 7.5 A8 8 0 1 0 19.5 16.5"
              stroke={t.color} strokeWidth="2.6" strokeLinecap="round" fill="none"/>
        <circle cx="19.5" cy="7.5" r="1.4" fill={t.color}/>
        <circle cx="19.5" cy="16.5" r="1.4" fill={t.color}/>
      </svg>
    );
  }

  if (agent === "codex") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label={aria} role="img">
        <circle cx="12" cy="12" r="8" stroke={t.color} strokeWidth="2.2" fill="none"/>
        <line x1="6.5" y1="17.5" x2="17.5" y2="6.5"
              stroke={t.color} strokeWidth="2.6" strokeLinecap="round"/>
      </svg>
    );
  }

  // Defensive: shape-kind agent without a matching branch falls back to dot.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={aria} role="img">
      <circle cx="12" cy="12" r="4" fill={t.color} />
    </svg>
  );
}
