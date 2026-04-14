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
      className="mx-5 my-2 rounded-lg bg-surface px-4 py-2.5 w-auto"
      style={{ borderLeft: "3px solid #fbbf24" }}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-amber font-medium">Conflict</span>
        <span className="text-text-secondary truncate font-mono text-[10px]">
          {truncatePath(first.file_path)}
        </span>
        {collisions.length > 1 && (
          <span className="text-text-muted ml-auto flex-shrink-0">
            +{collisions.length - 1} more
          </span>
        )}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {first.agents.map((agent) => {
          const color = agentColor(agent);
          return (
            <span
              key={agent}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                color,
                backgroundColor: color + "10",
                border: `1px solid ${color}20`,
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
