import AgentCard from "./AgentCard";
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
      <div className="px-5 py-4 border-b border-border w-full">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Agents</p>
        <p className="text-sm text-text-secondary">No agents detected</p>
      </div>
    );
  }

  const costMap = new Map(agentCosts.map((c) => [c.agent, c.total_cost_usd]));

  return (
    <div className="px-5 py-4 border-b border-border w-full">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Agents</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 w-full">
        {agentStats.map((stat) => (
          <AgentCard
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
