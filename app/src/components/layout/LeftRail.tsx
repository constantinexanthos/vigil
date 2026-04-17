import { useMemo } from "react";
import { HostGroup } from "../HostGroup";
import { hostToken } from "../../lib/host-tokens";
import { useSelection } from "../../store/selection";
import type { HostKind, SessionGroup } from "../../types";
import { HOST_KINDS } from "../../types";

interface Props {
  sessions: SessionGroup[];
}

export function LeftRail({ sessions }: Props) {
  const selectedId = useSelection((s) => s.selectedSessionId);
  const setSelected = useSelection((s) => s.setSelected);

  const { groups, idleHosts, totalLive } = useMemo(() => partition(sessions), [sessions]);

  return (
    <aside
      className="h-full overflow-y-auto"
      style={{
        background: "rgba(24,24,27,0.55)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
        <div className="text-[11px] tracking-[0.08em] uppercase text-white/45 font-semibold">
          Active now
        </div>
        <div className="text-[10px] text-white/35">{totalLive}</div>
      </div>

      {groups.length === 0 && (
        <div className="px-4 py-6 text-[12px] text-white/45">
          No agent activity yet. Start a session in a supported host to see it appear here.
        </div>
      )}

      {groups.map(({ kind, items }) => (
        <HostGroup
          key={kind}
          hostKind={kind}
          sessions={items}
          selectedId={selectedId}
          onSelect={setSelected}
        />
      ))}

      {idleHosts.length > 0 && (
        <div className="px-3.5 py-2.5 mt-3 opacity-50">
          <div className="text-[10px] tracking-[0.08em] uppercase text-white/35 font-semibold">
            Idle
          </div>
          <div className="text-[12px] text-white/55 mt-1.5">
            {idleHosts.map((k) => hostToken(k).label).join(" · ")}
          </div>
        </div>
      )}
    </aside>
  );
}

function partition(sessions: SessionGroup[]) {
  const byHost = new Map<HostKind, SessionGroup[]>();
  for (const s of sessions) {
    const kind = s.hostKind;
    if (!byHost.has(kind)) byHost.set(kind, []);
    byHost.get(kind)!.push(s);
  }
  const seenKinds = new Set(byHost.keys());
  const groups = Array.from(byHost.entries())
    .map(([kind, items]) => ({ kind, items: [...items].sort((a, b) => b.endTime.localeCompare(a.endTime)) }))
    .sort((a, b) => b.items.length - a.items.length);

  const idleHosts = HOST_KINDS.filter((k) => !seenKinds.has(k) && k !== "unknown");
  const totalLive = sessions.filter((s) => s.isLive).length;

  return { groups, idleHosts, totalLive };
}
