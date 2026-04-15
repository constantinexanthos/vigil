import { useState, useMemo } from "react";
import TopBar from "./components/TopBar";
import ProjectSection from "./components/ProjectSection";
import { useDaemonData } from "./hooks";
import { groupEventsIntoSessions } from "./types";
import type { AgentEvent } from "./types";

function filterByTime(events: AgentEvent[], range: string): AgentEvent[] {
  if (range === "all") return events;
  const now = Date.now();
  const cutoffs: Record<string, number> = {
    today: 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const ms = cutoffs[range] ?? cutoffs["today"];
  return events.filter((e) => now - new Date(e.timestamp).getTime() < ms);
}

export default function App() {
  const data = useDaemonData();
  const [agentFilter, setAgentFilter] = useState("");
  const [timeRange, setTimeRange] = useState("today");

  const allAgents = useMemo(() => {
    const set = new Set(data.events.map((e) => e.agent));
    return [...set].sort();
  }, [data.events]);

  const projects = useMemo(() => {
    let filtered = filterByTime(data.events, timeRange);
    if (agentFilter) {
      filtered = filtered.filter((e) => e.agent === agentFilter);
    }
    return groupEventsIntoSessions(filtered, data.commitGroups, data.costSummary);
  }, [data.events, data.commitGroups, data.costSummary, agentFilter, timeRange]);

  return (
    <div className="h-screen w-full bg-bg flex flex-col font-sans">
      <TopBar
        agents={allAgents}
        agentFilter={agentFilter}
        onAgentFilterChange={setAgentFilter}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />
      <div className="flex-1 overflow-y-auto">
        {!data.connected && data.error && (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-text-muted">{data.error}</p>
          </div>
        )}
        {data.connected && projects.length === 0 && (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-text-muted">No activity found</p>
          </div>
        )}
        {projects.map((project) => (
          <ProjectSection key={project.repoPath} project={project} />
        ))}
      </div>
    </div>
  );
}
