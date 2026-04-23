import { hostToken } from "../lib/host-tokens";
import { SessionRow } from "./SessionRow";
import type { HostKind, SessionGroup } from "../types";

interface Props {
  hostKind: HostKind;
  sessions: SessionGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HostGroup({ hostKind, sessions, selectedId, onSelect }: Props) {
  const token = hostToken(hostKind);
  const liveCount = sessions.filter((s) => s.isLive).length;

  return (
    <div className="px-1.5 mb-2.5">
      <div className="flex items-center gap-2 py-1 px-1.5">
        <span
          aria-hidden
          className={`w-1.5 h-1.5 rounded-full ${liveCount > 0 ? "animate-pulse-alive" : ""}`}
          style={{
            background: token.color,
            boxShadow: `0 0 8px ${token.color}`,
            opacity: liveCount > 0 ? undefined : 0.45,
          }}
        />
        <span className="text-[12px] text-white/75 font-semibold">{token.label}</span>
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
