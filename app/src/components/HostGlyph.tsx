/**
 * Inline SVG monogram for a terminal host. Single-color silhouettes
 * drawn from each app's official logomark, recolored through the
 * existing `hostToken().color` palette.
 *
 * See AgentGlyph.tsx for the rationale on (a) recoloring brand
 * silhouettes through Vigil's palette and (b) inlining path data
 * instead of depending on simple-icons.
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
    // Conductor — 3×2 window grid, matches AgentGlyph.
    // Source: extracted silhouette of /Applications/Conductor.app icon.
    case "conductor":
      return (
        <svg {...common}>
          <g fill={color}>
            <rect x="5"  y="5"   width="6"  height="4"  rx="0.8" />
            <rect x="13" y="5"   width="6"  height="4"  rx="0.8" />
            <rect x="5"  y="11"  width="6"  height="4"  rx="0.8" />
            <rect x="13" y="11"  width="6"  height="4"  rx="0.8" />
            <rect x="5"  y="17"  width="6"  height="2.5" rx="0.6" />
            <rect x="13" y="17"  width="6"  height="2.5" rx="0.6" />
          </g>
        </svg>
      );

    // Cursor — upward triangle with subtle inner-fold, matches AgentGlyph.
    case "cursor":
      return (
        <svg {...common}>
          <path d="M 12 3 L 21 19.5 L 3 19.5 Z" fill={color} />
          <line x1="12" y1="3" x2="12" y2="19.5"
                stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" />
        </svg>
      );

    // Terminal.app — square with chevron-prompt + cursor underline.
    // Source: freehand approximation of the macOS Terminal.app icon's
    // ">_" prompt motif. (No public SVG mark; the prompt is universally
    // understood as Terminal/shell.)
    case "terminal":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="4"
                stroke={color} strokeWidth="1.6" fill="none" opacity="0.55"/>
          <path d="M7 9 L11 12 L7 15"
                stroke={color} strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" fill="none"/>
          <line x1="13" y1="16" x2="17" y2="16"
                stroke={color} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );

    // Visual Studio Code — folded blue ribbon mark.
    // Source: simple-icons "visualstudiocode" path
    // (https://github.com/simple-icons/simple-icons/blob/develop/icons/visualstudiocode.svg)
    // recolored to the host token color.
    case "vscode":
      return (
        <svg {...common}>
          <path
            fill={color}
            d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"
          />
        </svg>
      );

    // Ghostty — ghost silhouette with scalloped bottom.
    // Source: freehand from Ghostty's ghost mark (ghostty.org).
    case "ghostty":
      return (
        <svg {...common}>
          <path
            fill={color}
            d="M 12 3 C 8 3 5.5 6.2 5.5 10.5 V 21 L 7 19.2 L 8.5 21 L 10 19.2 L 11.5 21 L 12.5 21 L 14 19.2 L 15.5 21 L 17 19.2 L 18.5 21 V 10.5 C 18.5 6.2 16 3 12 3 Z"
          />
        </svg>
      );

    // Warp — angular forward chevron / fast-forward mark.
    // Source: freehand approximation of the Warp (warp.dev) wordmark
    // glyph. Two stacked chevrons evoke "warp speed".
    case "warp":
      return (
        <svg {...common}>
          <g fill={color}>
            <path d="M 4 7 L 11 12 L 4 17 V 13.5 L 7 12 L 4 10.5 Z" />
            <path d="M 12 7 L 19 12 L 12 17 V 13.5 L 15 12 L 12 10.5 Z" />
          </g>
        </svg>
      );

    // Kitty — cat silhouette (head + ears).
    // Source: freehand approximation of the Kitty (sw.kovidgoyal.net/kitty)
    // mark. Triangular ears extending from a rounded head.
    case "kitty":
      return (
        <svg {...common}>
          <path
            fill={color}
            d="M 4.5 5 L 9 10 H 15 L 19.5 5 V 13 C 19.5 17 16.5 19.5 12 19.5 C 7.5 19.5 4.5 17 4.5 13 Z"
          />
        </svg>
      );

    // Zed — geometric Z silhouette.
    // Source: freehand silhouette of the Zed (zed.dev) Z mark; angular
    // shape rather than letter-form so it reads as a logo.
    case "zed":
      return (
        <svg {...common}>
          <path
            fill={color}
            d="M 4 4 L 20 4 V 7.5 L 9 16.5 H 20 V 20 H 4 V 16.5 L 15 7.5 H 4 Z"
          />
        </svg>
      );

    // Windsurf — wave silhouette.
    // Source: freehand from the Windsurf (windsurf.com / Codeium)
    // wave mark. Single-color cresting wave.
    case "windsurf":
      return (
        <svg {...common}>
          <path
            fill={color}
            d="M 3 14 Q 6 9 10 12 Q 13 14.5 17 11 Q 19 9.5 21 11 V 14 Q 19 13 17 14.5 Q 13 17.5 10 15 Q 6 12 3 17 Z"
          />
        </svg>
      );

    case "unknown":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" fill={FALLBACK_COLOR}/>
        </svg>
      );

    // Letter-monogram hosts: ghostty/iterm2/warp/kitty/alacritty/zed
    // for any case not covered above. The switch hits this default for
    // iterm2 and alacritty whose marks are essentially their letterform
    // (iTerm "i", Alacritty "α").
    default: {
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
    case "iterm2":    return "i";
    case "alacritty": return "α";
    default:          return "?";
  }
}
