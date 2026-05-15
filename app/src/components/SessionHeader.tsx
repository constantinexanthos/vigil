import { hostToken } from "../lib/host-tokens";
import { elapsedSince, repoName } from "../lib/formatters";
import type { SessionGroup } from "../types";
import { relativeTime } from "../types";
import { ModelPill } from "./ModelPill";

interface Props {
  session: SessionGroup;
}

// SessionHeader is the top strip of the session detail pane. Single row,
// same height as the AuditFeed toolbar in the proxy tab (h-9). Removes the
// framer-motion live pill in favor of an inline pulsing dot + text — same
// visual weight as the "Live" indicator the proxy tab uses, no separate
// rounded chip.
export function SessionHeader({ session }: Props) {
  const token = hostToken(session.hostKind);
  const elapsed = elapsedSince(session.startTime);

  return (
    <div className="px-4 h-9 border-b border-vigil-rule flex items-center gap-3 min-w-0">
      <div className="min-w-0 flex items-baseline gap-2">
        <span className="text-[13px] text-vigil-ink truncate font-medium">
          {session.description || "Session"}
        </span>
        <span className="text-[11px] text-vigil-mute font-mono truncate">
          {session.repoPath ? `${repoName(session.repoPath)} · ` : ""}
          {token.label} · {elapsed}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <ModelPill model={session.model} />
        {session.isLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-vigil-accent uppercase tracking-[0.10em]">
            <span
              aria-hidden
              className="w-1 h-1 rounded-full bg-vigil-accent animate-pulse-alive"
            />
            Running
          </span>
        ) : (
          <span className="text-[10px] text-vigil-mute uppercase tracking-[0.10em]">
            Closed · {relativeTime(session.endTime)}
          </span>
        )}
      </div>
    </div>
  );
}
