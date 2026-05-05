import { useMemo } from "react";
import { AgentCard } from "./AgentCard";
import type { LiveSessionRow } from "../../../types";

interface Props {
  liveSessions: LiveSessionRow[];
  onSelect: (sessionId: string) => void;
}

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
      <div className="px-5 py-3">
        <p className="text-[12px] text-white/45">No active agents.</p>
      </div>
    );
  }

  return (
    <div
      className="px-5 py-3 grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
    >
      {[...byAgent.entries()].map(([agent, sessions]) => (
        <AgentCard key={agent} agent={agent} sessions={sessions} onSelect={onSelect} />
      ))}
    </div>
  );
}
