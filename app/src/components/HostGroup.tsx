import { hostToken } from "../lib/host-tokens";
import { SessionRow } from "./SessionRow";
import { HostGlyph } from "./HostGlyph";
import { AgentGlyph } from "./AgentGlyph";
import type { HostKind, SessionGroup } from "../types";
import { agentColor, agentDisplayName } from "../types";

interface Props {
  hostKind: HostKind;
  sessions: SessionGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HostGroup({ hostKind, sessions, selectedId, onSelect }: Props) {
  const { label } = groupToken(hostKind, sessions);
  const liveCount = sessions.filter((s) => s.isLive).length;
  const glyph = chooseGlyph(hostKind, sessions);

  return (
    <div className="px-1.5 mb-2.5">
      <div className="flex items-center gap-2 py-1 px-1.5">
        <span
          className={`inline-flex items-center justify-center ${liveCount > 0 ? "animate-pulse-alive" : "opacity-60"}`}
          style={{ width: 16, height: 16 }}
          aria-hidden
        >
          {glyph}
        </span>
        <span className="text-sm text-white/75 font-semibold">{label}</span>
        <span className="text-stat text-white/35 ml-auto">{sessions.length}</span>
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
 * For known hosts (ghostty / iterm2 / etc.) use the host token's label.
 * For "unknown" hosts where we collapse onto the agent identity, return
 * the agent display name + color so the rail reads "Claude Code · 3"
 * instead of "Other · 3".
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

/**
 * Pick the glyph that matches the row's identity. For "unknown" hosts that
 * have collapsed onto a single agent (the common case where Vigil knows the
 * agent but not the terminal), show the *agent* glyph so Claude Code
 * sessions read as Claude Code, not as a generic "Other" dot.
 */
function chooseGlyph(hostKind: HostKind, sessions: SessionGroup[]) {
  if (hostKind === "unknown") {
    const agents = new Set(sessions.map((s) => s.agent));
    if (agents.size === 1) {
      return <AgentGlyph agent={[...agents][0]} size={14} />;
    }
  }
  return <HostGlyph hostKind={hostKind} size={14} />;
}
