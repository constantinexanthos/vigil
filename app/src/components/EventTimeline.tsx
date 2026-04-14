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
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <p className="text-xs text-text-muted uppercase tracking-wider mr-auto">Events</p>
        <input
          type="text"
          placeholder="Filter path..."
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          className="bg-surface border border-border text-text-primary text-[11px] px-2.5 py-1 rounded w-[160px] placeholder:text-text-muted focus:outline-none focus:border-accent/40 font-mono"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">No events</p>
        ) : (
          filtered.map((event) => (
            <EventRow key={event.id} event={event} isNew={newEventIds.has(event.id)} />
          ))
        )}
      </div>
    </div>
  );
}
