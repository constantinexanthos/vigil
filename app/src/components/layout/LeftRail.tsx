import { useMemo } from "react";
import { HostGroup } from "../HostGroup";
import { partitionSessionsByHost } from "../../lib/partition";
import { useSelection } from "../../store/selection";
import type { SessionGroup } from "../../types";

interface Props {
  sessions: SessionGroup[];
}

export function LeftRail({ sessions }: Props) {
  const selectedId = useSelection((s) => s.selectedSessionId);
  const setSelected = useSelection((s) => s.setSelected);

  const { groups } = useMemo(() => partitionSessionsByHost(sessions), [sessions]);

  return (
    <aside
      className="h-full overflow-y-auto pt-3.5 pb-3"
      style={{
        background: "rgba(24,24,27,0.55)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
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
    </aside>
  );
}

