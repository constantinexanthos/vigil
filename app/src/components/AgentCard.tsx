import { agentColor } from "../types";
import type { Collision } from "../types";

interface AgentCardProps {
  agent: string;
  fileCount: number;
  confidence: number;
  collisions: Collision[];
}

function confidenceColor(score: number): string {
  if (score > 75) return "#4ade80";
  if (score >= 50) return "#fbbf24";
  return "#ef4444";
}

export default function AgentCard({ agent, fileCount, confidence, collisions }: AgentCardProps) {
  const color = agentColor(agent);
  const hasCollision = collisions.some((c) => c.agents.includes(agent));

  return (
    <div
      className="flex-shrink-0 border rounded-lg p-3 min-w-[140px] transition-colors"
      style={{
        borderColor: hasCollision ? "#ef4444" : "#1a1d23",
        backgroundColor: "#0d0f12",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        <span className="text-xs font-semibold truncate" style={{ color }}>
          {agent}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-text-secondary">{fileCount} files</span>
        <span className="font-medium" style={{ color: confidenceColor(confidence) }}>
          {confidence}
        </span>
      </div>
    </div>
  );
}
