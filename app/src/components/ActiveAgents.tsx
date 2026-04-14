import AgentOrb from "./AgentOrb";
import type { AgentStat, Collision, ConfidenceScore } from "../types";
import type { AgentActivity } from "../hooks";

interface ActiveAgentsProps {
  agentStats: AgentStat[];
  collisions: Collision[];
  confidenceScores: ConfidenceScore[];
  agentActivity: Map<string, AgentActivity>;
  selectedAgent: string | null;
  onSelectAgent: (agent: string) => void;
}

export default function ActiveAgents({
  agentStats,
  collisions,
  confidenceScores,
  agentActivity,
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

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">ACTIVE AGENTS</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {agentStats.map((stat) => {
          const scoreData = confidenceScores.find((s) => s.agent === stat.agent);
          return (
            <AgentOrb
              key={stat.agent}
              agent={stat.agent}
              fileCount={scoreData?.file_count ?? stat.count}
              confidence={scoreData?.score}
              factors={scoreData?.factors}
              activity={agentActivity.get(stat.agent)}
              collisions={collisions}
              selected={selectedAgent === stat.agent}
              onSelect={onSelectAgent}
            />
          );
        })}
      </div>
    </div>
  );
}
