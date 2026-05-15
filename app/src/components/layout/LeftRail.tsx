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
      aria-label="Sessions"
      className="h-full flex flex-col overflow-y-auto py-2 border-r border-vigil-rule"
    >
      {groups.length === 0 && (
        <div className="px-3 py-3 text-[12px] text-vigil-mute leading-snug">
          No agent activity yet. Start a session in a supported host to see
          it appear here.
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
