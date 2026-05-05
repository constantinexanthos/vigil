import { AgentGlyph } from "../../AgentGlyph";
import { agentDisplayName, relativeTime, formatCost } from "../../../types";
import type { LiveSessionRow } from "../../../types";

interface Props {
  agent: string;
  sessions: LiveSessionRow[];
  onSelect: (sessionId: string) => void;
}

export function AgentCard({ agent, sessions, onSelect }: Props) {
  // Most recent live session by started_at desc.
  const liveSorted = sessions
    .filter((s) => s.is_live)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const top = liveSorted[0];
  if (!top) return null; // logic-impossibility guard; AgentGrid filters live agents only.

  const displayName = agentDisplayName(agent);
  const totalFiles = liveSorted.reduce((s, sess) => s + (sess.files_added ?? 0), 0);
  const totalCost = liveSorted.reduce((s, sess) => s + (sess.cost_usd ?? 0), 0);

  return (
    <button
      type="button"
      aria-label={`View ${displayName}'s most recent session`}
      className="text-left w-full bg-white/[0.025] border border-white/[0.06] rounded p-2.5 hover:bg-white/5 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
      onClick={() => onSelect(top.session_id)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <AgentGlyph agent={agent} size={12} />
        <span className="text-[12px] font-medium text-white/85">{displayName}</span>
        {top.model && (
          <span className="text-[10px] text-white/40 font-mono ml-auto truncate">
            {top.model}
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/55 mb-1.5 truncate">{top.description}</p>
      <div className="flex items-center justify-between text-[10px] text-white/45 tabular-nums">
        <span>{totalFiles} {totalFiles === 1 ? "file" : "files"}</span>
        <span>{relativeTime(top.started_at)}</span>
        {totalCost > 0 && <span>{formatCost(totalCost)}</span>}
      </div>
    </button>
  );
}
