import type { Collision } from "../types";
import { agentColor, agentDisplayName, truncatePath } from "../types";

interface CollisionBannerProps {
  collisions: Collision[];
}

export default function CollisionBanner({ collisions }: CollisionBannerProps) {
  if (collisions.length === 0) return null;

  const first = collisions[0];

  return (
    <div
      className="mx-4 my-2 rounded-lg bg-elevated px-3 py-2 overflow-hidden"
      style={{
        borderLeft: "3px solid #ff3333",
        animation: "slide-down 0.3s ease-out, collision-pulse 1.5s ease-in-out infinite",
      }}
    >
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-danger font-semibold">COLLISION</span>
        <span className="text-text-secondary truncate">{truncatePath(first.file_path)}</span>
        {collisions.length > 1 && (
          <span className="text-text-muted ml-auto flex-shrink-0">
            +{collisions.length - 1} more
          </span>
        )}
      </div>
      <div className="flex gap-1.5 mt-1">
        {first.agents.map((agent) => {
          const color = agentColor(agent);
          return (
            <span
              key={agent}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                color,
                backgroundColor: color + "15",
                border: `1px solid ${color}30`,
              }}
            >
              {agentDisplayName(agent)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
