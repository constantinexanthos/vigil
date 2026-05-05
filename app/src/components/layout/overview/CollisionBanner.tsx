import { agentDisplayName } from "../../../types";
import { displayPath } from "../../../lib/path";
import type { Collision } from "../../../types";

interface Props {
  collisions: Collision[];
}

export function CollisionBanner({ collisions }: Props) {
  if (collisions.length === 0) return null;
  const first = collisions[0];

  return (
    <div
      role="alert"
      aria-live="polite"
      className="bg-rose-500/10 border-b border-rose-400/20 px-4 py-1.5 flex items-center gap-2 text-[11px] text-rose-200"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse-alive flex-shrink-0" />
      <span className="font-medium">Conflict</span>
      <span className="font-mono text-rose-200/75 truncate">
        {displayPath(first.file_path, null)}
      </span>
      <span className="text-rose-200/55 ml-auto flex-shrink-0">
        {first.agents.map(agentDisplayName).join(" · ")}
      </span>
      {collisions.length > 1 && (
        <span className="text-rose-200/55 flex-shrink-0">+{collisions.length - 1} more</span>
      )}
    </div>
  );
}
