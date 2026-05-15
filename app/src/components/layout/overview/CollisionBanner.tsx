import { agentDisplayName } from "../../../types";
import { displayPath } from "../../../lib/path";
import type { Collision } from "../../../types";

// Toned-down conflict banner: rose-500 fill was loud. Linear-style errors
// are a single-pixel left border + accent text on the existing surface,
// not a filled bar. Brief calls this out explicitly. Accent here is the
// `bad` semantic color (one of the two allowed exceptions to the vigil-*
// spine), used at minimal weight — text + 2px left border, no background.
export function CollisionBanner({ collisions }: Props) {
  if (collisions.length === 0) return null;
  const first = collisions[0];

  return (
    <div
      role="alert"
      aria-live="polite"
      className="px-4 h-7 flex items-center gap-2 text-[11px] border-l-2 border-bad border-b border-vigil-rule text-vigil-ink"
    >
      <span className="text-bad font-medium uppercase tracking-[0.10em] text-[10px]">
        Conflict
      </span>
      <span className="font-mono text-vigil-mute truncate">
        {displayPath(first.file_path, null)}
      </span>
      <span className="text-vigil-mute ml-auto flex-shrink-0 truncate">
        {first.agents.map(agentDisplayName).join(" · ")}
      </span>
      {collisions.length > 1 && (
        <span className="text-vigil-mute flex-shrink-0 tabular-nums">
          +{collisions.length - 1} more
        </span>
      )}
    </div>
  );
}

interface Props {
  collisions: Collision[];
}
