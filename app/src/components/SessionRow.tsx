import { AgentGlyph } from "./AgentGlyph";
import { ModelChip } from "./ModelChip";
import { repoName } from "../lib/formatters";
import type { SessionGroup } from "../types";

interface Props {
  session: SessionGroup;
  selected: boolean;
  onSelect: () => void;
}

// SessionRow is the densest piece of the left rail. Single 28px row that
// reads agent · project on the left and +/-N on the right; the description
// flows into the available space if it fits. No motion-on-mount (was
// framer-motion); the rail can render dozens of rows on first paint and
// the animation overhead wasn't earning its weight. Selected state uses
// the same left-accent-border pattern as IdentitiesPane in the proxy tab.
export function SessionRow({ session, selected, onSelect }: Props) {
  const addedRemoved = tallyFiles(session);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left px-3 h-7 grid grid-cols-[12px_1fr_auto_auto] items-center gap-2 transition-colors duration-fast border-l-2 ${
        selected
          ? "bg-vigil-surface border-vigil-accent text-vigil-ink"
          : "border-transparent hover:bg-vigil-surface text-vigil-ink"
      }`}
    >
      <AgentGlyph agent={session.agent} size={12} />
      <div className="min-w-0 flex items-baseline gap-2 truncate">
        <span className="text-[12px] truncate">
          {session.description || session.agent}
        </span>
        <span className="text-[11px] text-vigil-mute truncate">
          {repoName(session.repoPath)}
        </span>
      </div>
      <span className="text-[10px] font-mono text-vigil-mute tabular-nums shrink-0">
        +{addedRemoved.added} −{addedRemoved.removed}
      </span>
      <ModelChip model={session.model} />
    </button>
  );
}

function tallyFiles(s: SessionGroup) {
  return s.files.reduce(
    (acc, f) => ({
      added: acc.added + (f.added || 0),
      removed: acc.removed + (f.removed || 0),
    }),
    { added: 0, removed: 0 },
  );
}
