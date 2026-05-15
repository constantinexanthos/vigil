import { AgentGlyph } from "../../AgentGlyph";
import { agentDisplayName, relativeTime, formatCost } from "../../../types";
import type { LiveSessionRow } from "../../../types";

interface Props {
  agent: string;
  sessions: LiveSessionRow[];
  onSelect: (sessionId: string) => void;
}

// AgentCard is the per-agent tile in the Active Agents grid. Matches the
// IdentitiesPane row pattern: single 28px row, agent name + meta inline,
// hover-tint. Three lines of content was the old shape — this is one
// line + one secondary line, so two cards now fit in the vertical space
// one card used to occupy.
export function AgentCard({ agent, sessions, onSelect }: Props) {
  const liveSorted = sessions
    .filter((s) => s.is_live)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const top = liveSorted[0];
  if (!top) return null;

  const displayName = agentDisplayName(agent);
  const totalFiles = liveSorted.reduce(
    (s, sess) => s + (sess.files_added ?? 0),
    0,
  );
  const totalCost = liveSorted.reduce((s, sess) => s + (sess.cost_usd ?? 0), 0);

  return (
    <button
      type="button"
      aria-label={`View ${displayName}'s most recent session`}
      className="text-left w-full px-3 py-2 border-l-2 border-transparent hover:bg-vigil-surface hover:border-vigil-accent transition-colors duration-fast text-vigil-ink"
      onClick={() => onSelect(top.session_id)}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AgentGlyph agent={agent} size={12} />
        <span className="text-[12px] truncate">{displayName}</span>
        {top.model && (
          <span className="text-[10px] text-vigil-mute font-mono ml-auto truncate shrink-0">
            {top.model}
          </span>
        )}
      </div>
      <div className="pl-[18px] mt-0.5 flex items-center gap-3 text-[11px] text-vigil-mute tabular-nums truncate">
        <span className="truncate">{top.description}</span>
        <span className="ml-auto shrink-0 flex items-center gap-3">
          <span>
            {totalFiles} {totalFiles === 1 ? "file" : "files"}
          </span>
          <span>{relativeTime(top.started_at)}</span>
          {totalCost > 0 && <span>{formatCost(totalCost)}</span>}
        </span>
      </div>
    </button>
  );
}
