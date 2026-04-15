import { useState, useMemo, useRef, useEffect } from "react";
import TopBar from "./components/TopBar";
import AgentSection from "./components/AgentSection";
import { useDaemonData } from "./hooks";
import { groupEventsIntoSessions, groupSessionsByAgent, relativeTime } from "./types";
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

  const agentGroups = useMemo(() => {
    let filtered = filterByTime(data.events, timeRange);
    if (agentFilter) {
      filtered = filtered.filter((e) => e.agent === agentFilter);
    }
    const projects = groupEventsIntoSessions(filtered, data.commitGroups, data.costSummary);
    return groupSessionsByAgent(projects, data.events, data.costSummary);
  }, [data.events, data.commitGroups, data.costSummary, agentFilter, timeRange]);

  const prevSessionIds = useRef<Set<string>>(new Set());
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(agentGroups.flatMap((g) => g.sessions.map((s) => s.id)));
    const fresh = new Set<string>();
    for (const id of currentIds) {
      if (!prevSessionIds.current.has(id)) fresh.add(id);
    }
    prevSessionIds.current = currentIds;
    if (fresh.size > 0) {
      setNewSessionIds(fresh);
      setTimeout(() => setNewSessionIds(new Set()), 400);
    }
  }, [agentGroups]);

  return (
    <div className="h-screen w-full bg-bg flex flex-col font-sans">
      <TopBar
        agents={allAgents}
        agentFilter={agentFilter}
        onAgentFilterChange={setAgentFilter}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        connected={data.connected}
        hasNewEvents={data.hasNewEvents}
      />
      <div className="flex-1 overflow-y-auto">
        {!data.connected && (
          <div className="flex flex-col items-center justify-center h-full px-8">
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "1px solid #232530",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}>
              <span style={{ color: "#52525b", fontSize: "18px" }}>V</span>
            </div>
            <p style={{ fontSize: "14px", color: "#71717a", textAlign: "center", marginBottom: "12px" }}>
              Start the Vigil daemon to see agent activity
            </p>
            <code style={{
              fontSize: "13px",
              fontFamily: "IBM Plex Mono, monospace",
              color: "#a1a1aa",
              background: "#151518",
              padding: "8px 16px",
              borderRadius: "6px",
            }}>
              vigil watch ~/projects
            </code>
          </div>
        )}
        {data.connected && agentGroups.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <p style={{ fontSize: "14px", color: "#71717a" }}>No agent activity found</p>
          </div>
        )}
        {agentGroups.map((group) => (
          <AgentSection
            key={group.agent}
            group={group}
            newSessionIds={newSessionIds}
            collisions={data.collisions}
          />
        ))}

        {data.connected && (
          <div style={{ textAlign: "center", padding: "16px" }}>
            <span style={{ fontSize: "11px", color: "#3f3f46" }}>
              Last updated: {relativeTime(new Date(data.lastUpdated).toISOString())}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
