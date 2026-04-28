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

  const { groups, idleHosts } = useMemo(() => partitionSessionsByHost(sessions), [sessions]);

  return (
    <aside className="h-full flex flex-col overflow-y-auto pt-3.5 pb-3">
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
        <div className="mt-auto px-4 pt-4 pb-1">
          <div className="text-[10px] text-white/30 leading-relaxed">
            Watching {idleHosts.map((k) => hostToken(k).label).join(" · ")}
          </div>
        </div>
      )}
    </aside>
  );
}

