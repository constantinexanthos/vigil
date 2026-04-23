// app/src/components/SessionHeader.tsx
import { motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import { elapsedSince, repoName } from "../lib/formatters";
import type { SessionGroup } from "../types";
import { relativeTime } from "../types";
import { ModelPill } from "./ModelPill";

interface Props {
  session: SessionGroup;
}

export function SessionHeader({ session }: Props) {
  const token = hostToken(session.hostKind);
  const elapsed = elapsedSince(session.startTime);

  return (
    <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[14px] text-white font-semibold truncate">{session.description || "Session"}</div>
        <div className="text-[11px] text-white/50 font-mono mt-0.5 truncate">
          {session.repoPath ? `${repoName(session.repoPath)} · ` : ""}
          {token.label} · {elapsed}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ModelPill model={session.model} />
        {session.isLive ? (
          <motion.div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: `${token.color}1A` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: token.color }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[11px] text-white/75">Running</span>
          </motion.div>
        ) : (
          <div className="rounded-full px-2.5 py-1 bg-white/5">
            <span className="text-[11px] text-white/55">Closed · {relativeTime(session.endTime)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
