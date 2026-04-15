import { useState } from "react";
import type { useDaemonData } from "../../hooks";
import CommitTimeline from "../CommitTimeline";
import WorkspaceSummary from "../WorkspaceSummary";
import { agentColor, agentDisplayName } from "../../types";

interface Props {
  data: ReturnType<typeof useDaemonData>;
}

export default function CommitsView({ data }: Props) {
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const agents = Array.from(new Set(data.commitGroups.map((c) => c.agent)));
  const filteredCommits = agentFilter
    ? data.commitGroups.filter((c) => c.agent === agentFilter)
    : data.commitGroups;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <WorkspaceSummary summary={data.workspaceSummary} />
      {agents.length > 1 && (
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Filter:</span>
          <button
            onClick={() => setAgentFilter(null)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
              agentFilter === null
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </button>
          {agents.map((agent) => {
            const color = agentColor(agent);
            const isActive = agentFilter === agent;
            return (
              <button
                key={agent}
                onClick={() => setAgentFilter(isActive ? null : agent)}
                className="text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer"
                style={{
                  color: isActive ? color : undefined,
                  borderColor: isActive ? color : undefined,
                  backgroundColor: isActive ? color + "15" : undefined,
                }}
              >
                {agentDisplayName(agent)}
              </button>
            );
          })}
        </div>
      )}
      <CommitTimeline commits={filteredCommits} />
    </div>
  );
}
