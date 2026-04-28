/**
 * Inline SVG monogram for a terminal host (Ghostty/iTerm2/Warp/etc.)
 * Mirrors AgentGlyph: bespoke shapes for hosts with strong brand
 * identity (Conductor C-ring, Cursor rotated-square, Terminal prompt
 * symbol, VS Code brackets, Windsurf wave) and letter monograms for
 * the rest. Fallback is a colored dot in the host token color.
 */

import { hostToken } from "../lib/host-tokens";
import type { HostKind } from "../types";

interface HostGlyphProps {
  hostKind: HostKind;
  size?: number;
  ariaLabel?: string;
}

const FALLBACK_COLOR = "#9ca3af";

export function HostGlyph({ hostKind, size = 16, ariaLabel }: HostGlyphProps) {
  // Defensive against runtime values that bypass the HostKind union.
  const token = (() => {
    try {
      return hostToken(hostKind);
    } catch {
      return undefined;
    }
  })();

  if (!token) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-label={ariaLabel ?? "Other"} role="img">
        <circle cx="12" cy="12" r="4" fill={FALLBACK_COLOR} />
      </svg>
    );
  }

  const color = token.color;
  const aria = ariaLabel ?? token.label;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24" as const,
    "aria-label": aria,
    role: "img" as const,
    fill: "none" as const,
  };

  switch (hostKind) {
    case "conductor":
      return (
        <svg {...common}>
          <path d="M19.5 7.5 A8 8 0 1 0 19.5 16.5"
                stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none"/>
          <circle cx="19.5" cy="7.5" r="1.4" fill={color}/>
          <circle cx="19.5" cy="16.5" r="1.4" fill={color}/>
        </svg>
      );

    case "cursor":
      return (
        <svg {...common}>
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.6"
                transform="rotate(45 12 12)"
                stroke={color} strokeWidth="2.2"/>
          <rect x="9.8" y="9.8" width="4.4" height="4.4" rx="0.8"
                transform="rotate(45 12 12)"
                fill={color}/>
        </svg>
      );

    case "terminal":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="4"
                stroke={color} strokeWidth="1.6" fill="none" opacity="0.55"/>
          <path d="M7 9 L11 12 L7 15"
                stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <line x1="13" y1="16" x2="17" y2="16"
                stroke={color} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );

    case "vscode":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="4"
                stroke={color} strokeWidth="1.6" fill="none" opacity="0.55"/>
          <path d="M9 8 L5 12 L9 16"
                stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d="M15 8 L19 12 L15 16"
                stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      );

    case "windsurf":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="4"
                stroke={color} strokeWidth="1.6" fill="none" opacity="0.55"/>
          <path d="M5 14 Q8.5 10 12 14 T19 14"
                stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
        </svg>
      );

    case "unknown":
      // Treat "unknown" as the neutral fallback dot in gray.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" fill={FALLBACK_COLOR}/>
        </svg>
      );

    default: {
      // Letter-monogram hosts: ghostty/iterm2/warp/kitty/alacritty/zed.
      const letter = letterFor(hostKind);
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="4"
                stroke={color} strokeWidth="1.6" fill="none" opacity="0.55"/>
          <text x="12" y="17"
                fontFamily='"SF Mono", "JetBrains Mono", "IBM Plex Mono", Menlo, monospace'
                fontSize="13" fontWeight="700" fill={color} textAnchor="middle">
            {letter}
          </text>
        </svg>
      );
    }
  }
}

function letterFor(kind: HostKind): string {
  switch (kind) {
    case "ghostty":   return "G";
    case "iterm2":    return "i";
    case "warp":      return "W";
    case "kitty":     return "K";
    case "alacritty": return "a";
    case "zed":       return "Z";
    default:          return "?";
  }
}
