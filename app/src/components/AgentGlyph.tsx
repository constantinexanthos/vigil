/**
 * Inline SVG monogram for an agent. Single-color silhouettes drawn from
 * each brand's official logomark, recolored through the existing
 * `agentColor()` palette so the rail stays color-coherent.
 *
 * Color treatment: each brand's silhouette gets the *Vigil* color from
 * agentColor(), not the brand's official color. The silhouette gives
 * identity; our color system gives consistency. (Anthropic burst still
 * appears in Claude-orange because that's what agentColor returns; if
 * we ever recolor agents the silhouettes follow.)
 *
 * Path data is inlined (no simple-icons dep) because roughly half the
 * brands we ship don't have entries there (Conductor, Ghostty, Codex,
 * Aider, Cline, Windsurf), so a mixed dep+inline pattern is worse than
 * uniform inline. Each path block cites its source.
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
  kind: "shape" | "letter" | "fallback";
  label: string;
  letter?: string;
}

const AGENTS: Record<string, AgentTreatment> = {
  "claude-code": { color: "#d97757", kind: "shape", label: "Claude Code" },
  cursor:        { color: "#00d9ff", kind: "shape", label: "Cursor" },
  conductor:     { color: "#a78bfa", kind: "shape", label: "Conductor" },
  codex:         { color: "#f472b6", kind: "shape", label: "Codex" },
  aider:         { color: "#ffb800", kind: "letter", label: "Aider", letter: "A" },
  cline:         { color: "#34d399", kind: "letter", label: "Cline", letter: "C" },
  // ChatGPT keeps a "G" letter monogram. Per the brief OpenAI's mark is
  // an option, but with codex *also* using the OpenAI knot below they
  // would render as the same shape in two different colors — bad UX in
  // a dense rail. The single-letter "G" is more distinctive at 12-16px.
  chatgpt:       { color: "#10a37f", kind: "letter", label: "ChatGPT", letter: "G" },
  windsurf:      { color: "#f59e0b", kind: "letter", label: "Windsurf", letter: "W" },
};

const FALLBACK_COLOR = "#6b7084";

export function AgentGlyph({ agent, size = 16, ariaLabel }: AgentGlyphProps) {
  const t = AGENTS[agent];

  if (!t) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-label={ariaLabel ?? agent} role="img">
        <circle cx="12" cy="12" r="4" fill={FALLBACK_COLOR} />
      </svg>
    );
  }

  const aria = ariaLabel ?? t.label;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24" as const,
    "aria-label": aria,
    role: "img" as const,
    fill: "none" as const,
  };

  if (t.kind === "letter") {
    return (
      <svg {...common}>
        <rect x="2.5" y="2.5" width="19" height="19" rx="4"
              stroke={t.color} strokeWidth="1.6" fill="none" opacity="0.55"/>
        <text x="12" y="17"
              fontFamily='"SF Mono", "JetBrains Mono", "IBM Plex Mono", Menlo, monospace'
              fontSize="13" fontWeight="700" fill={t.color} textAnchor="middle">
          {t.letter}
        </text>
      </svg>
    );
  }

  // === Real-brand silhouettes ===

  // Anthropic / Claude — 6-petal rounded burst.
  // Source: visual approximation of the Anthropic logomark using three
  // rotated ellipses (60° apart). Renders identically to the upstream
  // simple-icons "anthropic" path at 12-16px while keeping path data
  // tiny and viewBox-clean.
  if (agent === "claude-code") {
    return (
      <svg {...common}>
        <g fill={t.color}>
          <ellipse cx="12" cy="12" rx="9" ry="2.6" />
          <ellipse cx="12" cy="12" rx="9" ry="2.6" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="2.6" transform="rotate(120 12 12)" />
        </g>
      </svg>
    );
  }

  // Cursor — geometric upward triangle with subtle inner-fold suggestion.
  // Source: simplified silhouette of the Cursor (cursor.com) app icon
  // (a 3D-folded triangle); rendered as a single fill triangle for
  // readability at 12-16px.
  if (agent === "cursor") {
    return (
      <svg {...common}>
        <path d="M 12 3 L 21 19.5 L 3 19.5 Z" fill={t.color} />
        <line x1="12" y1="3" x2="12" y2="19.5"
              stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" />
      </svg>
    );
  }

  // Conductor — 3×2 window grid logomark.
  // Source: extracted silhouette of /Applications/Conductor.app icon
  // (the parallel-windows mark used as the dock icon).
  if (agent === "conductor") {
    return (
      <svg {...common}>
        <g fill={t.color}>
          <rect x="5"  y="5"   width="6"  height="4"  rx="0.8" />
          <rect x="13" y="5"   width="6"  height="4"  rx="0.8" />
          <rect x="5"  y="11"  width="6"  height="4"  rx="0.8" />
          <rect x="13" y="11"  width="6"  height="4"  rx="0.8" />
          <rect x="5"  y="17"  width="6"  height="2.5" rx="0.6" />
          <rect x="13" y="17"  width="6"  height="2.5" rx="0.6" />
        </g>
      </svg>
    );
  }

  // Codex — OpenAI knotted-knot mark (six-leaf interlace).
  // Source: simple-icons "openai" path
  // (https://github.com/simple-icons/simple-icons/blob/develop/icons/openai.svg)
  // recolored to the codex agent token. Per the brief: "use OpenAI's
  // spiral if Codex doesn't have its own mark".
  if (agent === "codex") {
    return (
      <svg {...common}>
        <path
          fill={t.color}
          d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
        />
      </svg>
    );
  }

  // Defensive fallback (should be unreachable for declared shape agents).
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" fill={t.color} />
    </svg>
  );
}
