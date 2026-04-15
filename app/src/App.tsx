import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import TopBar from "./components/TopBar";
import AgentSection from "./components/AgentSection";
import CommandPalette from "./components/CommandPalette";
import { useDaemonData } from "./hooks";
import { groupEventsIntoSessions } from "./types";
import type { AgentEvent } from "./types";

function filterByTime(events: AgentEvent[], range: string): AgentEvent[] {
  if (range === "all") return events;
  const now = Date.now();
  const ms: Record<string, number> = { today: 86400000, "7d": 604800000, "30d": 2592000000 };
  return events.filter((e) => now - new Date(e.timestamp).getTime() < (ms[range] ?? ms.today));
}

export default function App() {
  const data = useDaemonData();
  const [agentFilter, setAgentFilter] = useState("");
  const [timeRange, setTimeRange] = useState("today");
  const [cmdOpen, setCmdOpen] = useState(false);

  const allAgents = useMemo(() => [...new Set(data.events.map((e) => e.agent))].sort(), [data.events]);

  const projects = useMemo(() => {
    let filtered = filterByTime(data.events, timeRange);
    if (agentFilter) filtered = filtered.filter((e) => e.agent === agentFilter);
    return groupEventsIntoSessions(filtered, data.commitGroups, data.costSummary);
  }, [data.events, data.commitGroups, data.costSummary, agentFilter, timeRange]);

  const agentGroups = useMemo(() => {
    const map = new Map<string, typeof projects[0]["sessions"]>();
    for (const p of projects) {
      for (const s of p.sessions) {
        const existing = map.get(s.agent) ?? [];
        existing.push(s);
        map.set(s.agent, existing);
      }
    }
    return [...map.entries()].map(([agent, sessions]) => ({
      agent,
      sessions: sessions.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()),
      totalCost: sessions.reduce((sum, s) => sum + s.costUsd, 0),
    }));
  }, [projects]);

  const prevSessionIds = useRef<Set<string>>(new Set());
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(agentGroups.flatMap((g) => g.sessions.map((s) => s.id)));
    const fresh = new Set<string>();
    for (const id of currentIds) { if (!prevSessionIds.current.has(id)) fresh.add(id); }
    prevSessionIds.current = currentIds;
    if (fresh.size > 0) { setNewSessionIds(fresh); setTimeout(() => setNewSessionIds(new Set()), 500); }
  }, [agentGroups]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const alertCount = data.collisions.length;
  const totalCost = data.costSummary.total_cost_usd;
  const showEmpty = !data.connected || (data.connected && agentGroups.length === 0);

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
        agentCount={data.agentStats.length}
        totalCost={totalCost}
        alertCount={alertCount}
        onOpenCmd={() => setCmdOpen(true)}
      />

      <div className="flex-1 overflow-y-auto" style={{ padding: "12px 12px" }}>
        {showEmpty && (
          <div className="flex flex-col items-center justify-center h-full">
            <img src="/logo.png" alt="" width={24} height={24} style={{ imageRendering: "auto", marginBottom: 12, opacity: 0.5 }}
              onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>No agent activity yet</p>
            <code className="font-mono selectable" style={{
              fontSize: 12, color: "#9CA3AF", background: "#2C2C2E",
              padding: "6px 14px", borderRadius: 6,
            }}>
              vigil watch ~/projects
            </code>
          </div>
        )}

        <AnimatePresence>
          {agentGroups.map((group) => (
            <AgentSection
              key={group.agent}
              agent={group.agent}
              sessions={group.sessions}
              totalCost={group.totalCost}
              collisions={data.collisions}
              newSessionIds={newSessionIds}
            />
          ))}
        </AnimatePresence>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        agents={allAgents}
        onSelectAgent={(a) => { setAgentFilter(a); setCmdOpen(false); }}
        onClearFilter={() => { setAgentFilter(""); setCmdOpen(false); }}
      />
    </div>
  );
}
