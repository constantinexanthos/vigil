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
  "claude-code": "#22d3ee",
  cursor: "#4ade80",
  codex: "#fb923c",
  conductor: "#a855f7",
};

export function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? "#6b7084";
}
