import AgentOrb from "./AgentOrb";
import type { AgentStat, Collision, CostAgentSummary } from "../types";
import type { AgentActivity } from "../hooks";

interface ActiveAgentsProps {
  agentStats: AgentStat[];
  collisions: Collision[];
  agentActivity: Map<string, AgentActivity>;
  agentCosts: CostAgentSummary[];
  selectedAgent: string | null;
  onSelectAgent: (agent: string) => void;
}

export default function ActiveAgents({
  agentStats,
  collisions,
  agentActivity,
  agentCosts,
  selectedAgent,
  onSelectAgent,
}: ActiveAgentsProps) {
  if (agentStats.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">
          ACTIVE AGENTS
        </p>
        <p className="text-xs text-text-secondary">No agents detected</p>
      </div>
    );
  }

  const costMap = new Map(agentCosts.map((c) => [c.agent, c.total_cost_usd]));

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">ACTIVE AGENTS</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {agentStats.map((stat) => (
          <AgentOrb
            key={stat.agent}
            agent={stat.agent}
            fileCount={stat.count}
            costUsd={costMap.get(stat.agent) ?? 0}
            activity={agentActivity.get(stat.agent)}
            collisions={collisions}
            selected={selectedAgent === stat.agent}
            onSelect={onSelectAgent}
          />
        ))}
      </div>
    </div>
  );
}
