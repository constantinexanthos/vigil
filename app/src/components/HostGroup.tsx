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

// HostGroup is the section-header + row-list inside LeftRail. The header
// uses the same uppercase-tracking treatment as the section headers in the
// proxy tab — same hierarchy across surfaces. Row spacing collapsed (was
// 3px between rows + 10px between groups) so 1440×900 fits 2× more rows.
export function HostGroup({ hostKind, sessions, selectedId, onSelect }: Props) {
  const header = groupHeader(hostKind, sessions);
  const liveCount = sessions.filter((s) => s.isLive).length;
  const glyph = chooseGlyph(hostKind, sessions);

  return (
    <div className="mb-1">
      {header && (
        <div className="flex items-center gap-2 px-3 h-6">
          <span
            className={`inline-flex items-center justify-center ${
              liveCount > 0 ? "animate-pulse-alive" : "opacity-50"
            }`}
            style={{ width: 12, height: 12 }}
            aria-hidden
          >
            {glyph}
          </span>
          <span className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute truncate">
            {header.label}
          </span>
          <span className="text-[10px] text-vigil-mute/70 ml-auto tabular-nums">
            {sessions.length}
          </span>
        </div>
      )}
      <div>
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

function groupHeader(
  hostKind: HostKind,
  sessions: SessionGroup[],
): { label: string; color: string } | null {
  if (hostKind !== "unknown") {
    const token = hostToken(hostKind);
    return { label: token.label, color: token.color };
  }
  const agents = new Set(sessions.map((s) => s.agent));
  if (agents.size === 1) {
    const agent = [...agents][0];
    return { label: agentDisplayName(agent), color: agentColor(agent) };
  }
  return null;
}

function chooseGlyph(hostKind: HostKind, sessions: SessionGroup[]) {
  if (hostKind === "unknown") {
    const agents = new Set(sessions.map((s) => s.agent));
    if (agents.size === 1) {
      return <AgentGlyph agent={[...agents][0]} size={12} />;
    }
  }
  return <HostGlyph hostKind={hostKind} size={12} />;
}
