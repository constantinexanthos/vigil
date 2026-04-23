import { hostToken } from "../lib/host-tokens";
import type { SessionGroup } from "../types";
import { formatCost } from "../types";

interface Props {
  session: SessionGroup;
}

export function SessionFooter({ session }: Props) {
  const token = hostToken(session.hostKind);
  const fileCount = session.files.length;

  return (
    <div className="px-5 py-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-white/45">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: token.color }} aria-hidden />
          <span className="text-white/60">{token.label}</span>
          {session.isLive && <span className="text-white/40">· working</span>}
        </span>
        {session.costUsd > 0 && <span>{formatCost(session.costUsd)}</span>}
      </div>
      <div className="font-mono">{fileCount} files touched</div>
    </div>
  );
}
