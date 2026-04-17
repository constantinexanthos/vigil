import { useMemo } from "react";
import { HostGroup } from "../HostGroup";
import { hostToken } from "../../lib/host-tokens";
import { partitionSessionsByHost } from "../../lib/partition";
import { useSelection } from "../../store/selection";
import type { SessionGroup } from "../../types";

interface Props {
  sessions: SessionGroup[];
}

export function LeftRail({ sessions }: Props) {
  const selectedId = useSelection((s) => s.selectedSessionId);
  const setSelected = useSelection((s) => s.setSelected);

  const { groups, idleHosts, totalLive } = useMemo(() => partitionSessionsByHost(sessions), [sessions]);

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

