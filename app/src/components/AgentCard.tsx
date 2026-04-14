import Sparkline from "./Sparkline";
import { agentColor, agentDisplayName, fileName, formatCost } from "../types";
import type { AgentActivity } from "../hooks";
import type { Collision } from "../types";

interface AgentCardProps {
  agent: string;
  fileCount: number;
  costUsd: number;
  activity: AgentActivity | undefined;
  collisions: Collision[];
  selected: boolean;
  onSelect: (agent: string) => void;
}

export default function AgentCard({
  agent,
  fileCount,
  costUsd,
  activity,
  collisions,
  selected,
  onSelect,
}: AgentCardProps) {
  const color = agentColor(agent);
  const displayName = agentDisplayName(agent);
  const hasCollision = collisions.some((c) => c.agents.includes(agent));
  const sparkline = activity?.sparkline ?? [];
  const lastFile = activity?.lastFile;

  return (
    <div
      className="rounded-lg p-3 transition-colors cursor-pointer border"
      onClick={() => onSelect(agent)}
      style={{
        backgroundColor: selected ? "#14161c" : "#0f1115",
        borderColor: selected ? color + "40" : "#1e2028",
        borderLeftWidth: selected ? 2 : 1,
        borderLeftColor: selected ? color : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[12px] font-medium text-text-primary">{displayName}</span>
        </div>
        {hasCollision && (
          <span className="text-[9px] text-amber px-1.5 py-0.5 rounded bg-amber/10">conflict</span>
        )}
      </div>

      {sparkline.length > 0 && (
        <div className="mb-2">
          <Sparkline data={sparkline} color={color} />
        </div>
      )}

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-text-secondary">{fileCount} files</span>
        {costUsd > 0 && (
          <span className="text-text-muted">{formatCost(costUsd)}</span>
        )}
      </div>

      {lastFile && (
        <div className="text-[10px] text-text-muted truncate mt-1 font-mono" title={lastFile}>
          {fileName(lastFile)}
        </div>
      )}
    </div>
  );
}
