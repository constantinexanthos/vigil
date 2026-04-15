import { useState, useMemo, useRef, useEffect } from "react";
import TopBar from "./components/TopBar";
import BriefingCard from "./components/BriefingCard";
import LivePulse from "./components/LivePulse";
import ProjectSection from "./components/ProjectSection";
import { useDaemonData } from "./hooks";
import { groupEventsIntoSessions, relativeTime } from "./types";
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

  const prevSessionIds = useRef<Set<string>>(new Set());
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(projects.flatMap((p) => p.sessions.map((s) => s.id)));
    const fresh = new Set<string>();
    for (const id of currentIds) {
      if (!prevSessionIds.current.has(id)) fresh.add(id);
    }
    prevSessionIds.current = currentIds;
    if (fresh.size > 0) {
      setNewSessionIds(fresh);
      setTimeout(() => setNewSessionIds(new Set()), 400);
    }
  }, [projects]);

  // Compute briefing stats
  const briefingStats = useMemo(() => {
    const allSessions = projects.flatMap((p) => p.sessions);
    const agentCount = data.agentStats.length;
    const filesChanged = data.workspaceSummary.files_changed_today;
    const sessionCount = allSessions.length;
    const costUsd = data.costSummary.total_cost_usd;
    const collisionCount = data.collisions.length;

    // Average confidence across sessions that have a confidence score
    const scored = allSessions.filter((s) => s.confidence > 0);
    const confidence = scored.length > 0
      ? Math.round(scored.reduce((sum, s) => sum + s.confidence, 0) / scored.length)
      : 0;

    const lowConfidenceCount = allSessions.filter((s) => s.confidence > 0 && s.confidence < 60).length;

    return { agentCount, filesChanged, confidence, sessionCount, costUsd, collisionCount, lowConfidenceCount };
  }, [projects, data.agentStats, data.workspaceSummary, data.costSummary, data.collisions]);

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
      {data.connected && (
        <BriefingCard
          agentCount={briefingStats.agentCount}
          filesChanged={briefingStats.filesChanged}
          confidence={briefingStats.confidence}
          sessionCount={briefingStats.sessionCount}
          costUsd={briefingStats.costUsd}
          collisionCount={briefingStats.collisionCount}
          lowConfidenceCount={briefingStats.lowConfidenceCount}
        />
      )}
      {data.connected && (
        <LivePulse events={data.events} costSummary={data.costSummary} />
      )}
      <div className="flex-1 overflow-y-auto">
        {!data.connected && (
          <div className="flex flex-col items-center justify-center h-full px-8">
            <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center mb-4">
              <span className="text-text-faint text-[18px]">V</span>
            </div>
            <p className="text-[14px] text-text-muted text-center mb-3">
              Start the Vigil daemon to see agent activity
            </p>
            <code className="text-[13px] font-mono text-text-subtle bg-surface px-4 py-2 rounded">
              vigil watch ~/projects
            </code>
          </div>
        )}
        {data.connected && projects.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-[14px] text-text-muted">No activity found</p>
          </div>
        )}
        {projects.map((project) => (
          <ProjectSection
            key={project.repoPath}
            project={project}
            newSessionIds={newSessionIds}
            collisions={data.collisions}
          />
        ))}

        {/* Last updated footer */}
        {data.connected && (
          <div className="text-center py-4">
            <span style={{ fontSize: "11px", color: "#3f3f46" }}>
              Last updated: {relativeTime(new Date(data.lastUpdated).toISOString())}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
