import { useState, useMemo } from "react";
import EventRow from "./EventRow";
import type { AgentEvent, AgentStat } from "../types";

interface EventTimelineProps {
  events: AgentEvent[];
  agentStats: AgentStat[];
}

export default function EventTimeline({ events, agentStats }: EventTimelineProps) {
  const [agentFilter, setAgentFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (agentFilter && e.agent !== agentFilter) return false;
      if (pathFilter && !e.file_path.toLowerCase().includes(pathFilter.toLowerCase()))
        return false;
      return true;
    });
  }, [events, agentFilter, pathFilter]);

  const agents = agentStats.map((s) => s.agent);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mr-auto">Timeline</p>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="bg-surface border border-border text-text-secondary text-[10px] px-2 py-1 rounded focus:outline-none focus:border-accent"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter path..."
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          className="bg-surface border border-border text-text-primary text-[10px] px-2 py-1 rounded w-[120px] placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-8">No events</p>
        ) : (
          filtered.map((event) => <EventRow key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
}
