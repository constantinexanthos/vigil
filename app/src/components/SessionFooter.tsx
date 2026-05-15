import { hostToken } from "../lib/host-tokens";
import type { SessionGroup } from "../types";
import { formatCost } from "../types";

interface Props {
  session: SessionGroup;
}

// SessionFooter is the meta strip below the session detail. Same h-6 row
// height as the column-header strip in proxy AuditFeed; all-tabular-mono
// secondary ink so it reads as supplementary metadata, not a primary surface.
export function SessionFooter({ session }: Props) {
  const token = hostToken(session.hostKind);
  const fileCount = session.files.length;
  return (
    <div className="px-4 h-6 border-t border-vigil-rule flex items-center justify-between text-[10px] text-vigil-mute tabular-nums">
      <div className="flex items-center gap-3 truncate">
        <span className="truncate">
          {token.label}
          {session.isLive && " · working"}
        </span>
        {session.costUsd > 0 && <span>{formatCost(session.costUsd)}</span>}
      </div>
      <div className="font-mono shrink-0">{fileCount} files touched</div>
    </div>
  );
}
