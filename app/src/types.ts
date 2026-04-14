export interface AgentEvent {
  id: number;
  timestamp: string;
  kind: string;
  file_path: string | null;
  agent: string;
  diff: string | null;
}

export interface Collision {
  file_path: string;
  agents: string[];
}

export interface AgentStat {
  agent: string;
  count: number;
}

export const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#00ff41",
  cursor: "#00d9ff",
  conductor: "#a78bfa",
  aider: "#ffb800",
  codex: "#f472b6",
  cline: "#34d399",
};

export function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? "#6b7084";
}

const DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude",
  cursor: "Cursor",
  conductor: "Conductor",
  aider: "Aider",
  codex: "Codex",
  cline: "Cline",
};

export function agentDisplayName(agent: string): string {
  return DISPLAY_NAMES[agent] ?? agent;
}

interface KindIconResult {
  symbol: string;
  color: string;
}

const KIND_ICONS: Record<string, KindIconResult> = {
  file_write: { symbol: "W", color: "#00ff41" },
  file_create: { symbol: "+", color: "#34d399" },
  file_delete: { symbol: "x", color: "#ff3333" },
  file_rename: { symbol: "~", color: "#ffb800" },
  file_modify: { symbol: "M", color: "#00d9ff" },
  checkpoint: { symbol: "C", color: "#a78bfa" },
};

export function kindIcon(kind: string): KindIconResult {
  return KIND_ICONS[kind] ?? { symbol: ".", color: "#6b7084" };
}

export function truncatePath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

export function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export interface CostAgentSummary {
  agent: string;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  event_count: number;
}

export interface CostSummary {
  total_cost_usd: number;
  agents: CostAgentSummary[];
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
