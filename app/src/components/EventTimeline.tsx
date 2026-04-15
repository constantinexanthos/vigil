import { useState, useMemo } from "react";
import EventRow from "./EventRow";
import type { AgentEvent } from "../types";

interface EventTimelineProps {
  events: AgentEvent[];
  agentFilter: string | null;
  newEventIds: Set<number>;
}

export default function EventTimeline({
  events,
  agentFilter,
  newEventIds,
}: EventTimelineProps) {
  const [pathFilter, setPathFilter] = useState("");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (agentFilter && e.agent !== agentFilter) return false;
      if (pathFilter && !(e.file_path ?? "").toLowerCase().includes(pathFilter.toLowerCase()))
        return false;
      return true;
    });
  }, [events, agentFilter, pathFilter]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mr-auto">LIVE FEED</p>
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
          filtered.map((event) => (
            <EventRow key={event.id} event={event} isNew={newEventIds.has(event.id)} />
          ))
        )}
      </div>
    </div>
  );
}
