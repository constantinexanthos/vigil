import { hostToken } from "../lib/host-tokens";
import { SessionRow } from "./SessionRow";
import type { HostKind, SessionGroup } from "../types";
import { agentColor, agentDisplayName } from "../types";

interface Props {
  hostKind: HostKind;
  sessions: SessionGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HostGroup({ hostKind, sessions, selectedId, onSelect }: Props) {
  const { label, color } = groupToken(hostKind, sessions);
  const liveCount = sessions.filter((s) => s.isLive).length;

  return (
    <div className="px-1.5 mb-2.5">
      <div className="flex items-center gap-2 py-1 px-1.5">
        <span
          aria-hidden
          className={`w-1.5 h-1.5 rounded-full ${liveCount > 0 ? "animate-pulse-alive" : ""}`}
          style={{
            background: color,
            boxShadow: `0 0 8px ${color}`,
            opacity: liveCount > 0 ? undefined : 0.45,
          }}
        />
        <span className="text-[12px] text-white/75 font-semibold">{label}</span>
        <span className="text-[10px] text-white/35 ml-auto">{sessions.length}</span>
      </div>
      <div className="ml-3.5 mt-1 space-y-[3px]">
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            selected={selectedId === s.id}
            onSelect={() => onSelect(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * For known hosts (ghostty / iterm2 / etc.) use the host's token.
 * For "unknown" hosts — the common case where host detection falls through —
 * derive the label and color from the agent(s) inside. When all sessions share
 * one agent ("claude-code", "conductor", …) show the agent's display name in
 * its color so the rail reads like "Claude Code · N" instead of "Other · N".
 * Mixed-agent unknown hosts keep the neutral "Other" label.
 */
function groupToken(hostKind: HostKind, sessions: SessionGroup[]): { label: string; color: string } {
  if (hostKind !== "unknown") {
    const token = hostToken(hostKind);
    return { label: token.label, color: token.color };
  }
  const agents = new Set(sessions.map((s) => s.agent));
  if (agents.size === 1) {
    const agent = [...agents][0];
    return { label: agentDisplayName(agent), color: agentColor(agent) };
  }
  const token = hostToken(hostKind);
  return { label: token.label, color: token.color };
}
