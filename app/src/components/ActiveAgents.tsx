import AgentCard from "./AgentCard";
import type { AgentStat, Collision } from "../types";

interface ActiveAgentsProps {
  agentStats: AgentStat[];
  collisions: Collision[];
}

export default function ActiveAgents({ agentStats, collisions }: ActiveAgentsProps) {
  if (agentStats.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Active Agents</p>
        <p className="text-xs text-text-secondary">No agents detected</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Active Agents</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {agentStats.map((stat) => (
          <AgentCard
            key={stat.agent}
            agent={stat.agent}
            fileCount={stat.count}
            confidence={Math.round(70 + Math.random() * 25)}
            collisions={collisions}
          />
        ))}
      </div>
    </div>
  );
}
