import Sparkline from "./Sparkline";
import { agentColor, agentDisplayName, fileName, formatCost } from "../types";
import type { AgentActivity } from "../hooks";
import type { Collision } from "../types";

interface AgentOrbProps {
  agent: string;
  fileCount: number;
  costUsd: number;
  activity: AgentActivity | undefined;
  collisions: Collision[];
  selected: boolean;
  onSelect: (agent: string) => void;
}

function pulseSpeed(lastEventTime: number): string | null {
  const ago = (Date.now() - lastEventTime) / 1000;
  if (ago < 10) return "0.8s";
  if (ago < 30) return "2s";
  return null;
}

export default function AgentOrb({
  agent,
  fileCount,
  costUsd,
  activity,
  collisions,
  selected,
  onSelect,
}: AgentOrbProps) {
  const color = agentColor(agent);
  const displayName = agentDisplayName(agent);
  const hasCollision = collisions.some((c) => c.agents.includes(agent));
  const speed = activity ? pulseSpeed(activity.lastEventTime) : null;
  const sparkline = activity?.sparkline ?? [];
  const lastFile = activity?.lastFile;

  return (
    <div
      className="flex-shrink-0 rounded-lg p-2.5 min-w-[120px] max-w-[140px] transition-all cursor-pointer"
      onClick={() => onSelect(agent)}
      style={{
        backgroundColor: selected ? "#12141a" : "#0d0f12",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: hasCollision ? "#ff3333" : selected ? color + "60" : "#1a1d23",
        boxShadow: hasCollision
          ? "0 0 8px rgba(255,51,51,0.2)"
          : speed
            ? `0 0 6px ${color}30`
            : "none",
        animation: speed
          ? `pulse-ring ${speed} ease-in-out infinite`
          : hasCollision
            ? "collision-pulse 1.5s ease-in-out infinite"
            : "none",
        ["--pulse-color" as string]: `${color}50`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-[11px] font-semibold truncate" style={{ color }}>
          {displayName}
        </span>
      </div>

      {sparkline.length > 0 && (
        <div className="mb-1.5">
          <Sparkline data={sparkline} color={color} />
        </div>
      )}

      <div className="flex items-center justify-between text-[9px]">
        <span className="text-text-secondary">{fileCount} files</span>
        {costUsd > 0 && (
          <span style={{ color: "#ffb800" }}>{formatCost(costUsd)}</span>
        )}
      </div>

      {lastFile && (
        <div className="text-[9px] text-text-muted truncate mt-1" title={lastFile}>
          {fileName(lastFile)}
        </div>
      )}
    </div>
  );
}
