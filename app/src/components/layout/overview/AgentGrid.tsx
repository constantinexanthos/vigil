import { useMemo } from "react";
import { AgentCard } from "./AgentCard";
import type { LiveSessionRow } from "../../../types";

interface Props {
  liveSessions: LiveSessionRow[];
  onSelect: (sessionId: string) => void;
}

// AgentGrid is the Active Agents pane. Was a grid of card-style tiles;
// the polish pass collapses it into a vertical list of row-style entries
// matching the LeftRail / IdentitiesPane density. At 1440×900 a wide
// 240×900px sidebar fit 4 of the old cards; the new row pattern fits 8+.
export function AgentGrid({ liveSessions, onSelect }: Props) {
  const byAgent = useMemo(() => {
    const map = new Map<string, LiveSessionRow[]>();
    for (const s of liveSessions) {
      if (!s.is_live) continue;
      const list = map.get(s.agent) ?? [];
      list.push(s);
      map.set(s.agent, list);
    }
    return map;
  }, [liveSessions]);

  if (byAgent.size === 0) {
    return (
      <div className="px-4 py-2 text-[12px] text-vigil-mute">
        No active agents.
      </div>
    );
  }

  return (
    <div role="list">
      {[...byAgent.entries()].map(([agent, sessions]) => (
        <div role="listitem" key={agent}>
          <AgentCard agent={agent} sessions={sessions} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
