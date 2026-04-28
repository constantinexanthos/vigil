import type { HostKind } from "../types";

export interface HostToken {
  label: string;
  color: string;   // hex — also used for box-shadow glow
}

const MAP: Record<HostKind, HostToken> = {
  ghostty:   { label: "Ghostty",    color: "#00ff88" },
  iterm2:    { label: "iTerm2",     color: "#ffb800" },
  terminal:  { label: "Terminal",   color: "#60a5fa" },
  warp:      { label: "Warp",       color: "#f472b6" },
  kitty:     { label: "Kitty",      color: "#fb923c" },
  alacritty: { label: "Alacritty",  color: "#818cf8" },
  conductor: { label: "Conductor",  color: "#a78bfa" },
  cursor:    { label: "Cursor",     color: "#00d9ff" },
  vscode:    { label: "VS Code",    color: "#0ea5e9" },
  zed:       { label: "Zed",        color: "#34d399" },
  windsurf:  { label: "Windsurf",   color: "#f59e0b" },
  unknown:   { label: "Other",      color: "#9ca3af" },
};

export function hostToken(kind: HostKind): HostToken {
  return MAP[kind];
}
