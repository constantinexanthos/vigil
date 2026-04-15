import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import TopBar from "./components/TopBar";
import AgentSection from "./components/AgentSection";
import CommandPalette from "./components/CommandPalette";
import DemoBanner from "./components/DemoBanner";
import SetupModal from "./components/SetupModal";
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
  const [showSetup, setShowSetup] = useState(false);
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const wasDemoMode = useRef(false);

  // Track transition from demo to live
  useEffect(() => {
    if (wasDemoMode.current && data.connected && !data.demoMode) {
      setTransitionMessage("Connected! Showing live data");
      setTimeout(() => setTransitionMessage(null), 3000);
    }
    wasDemoMode.current = data.demoMode;
  }, [data.connected, data.demoMode]);

  const allAgents = useMemo(() => [...new Set(data.events.map((e) => e.agent))].sort(), [data.events]);

  const projects = useMemo(() => {
    let filtered = filterByTime(data.events, timeRange);
    if (agentFilter) filtered = filtered.filter((e) => e.agent === agentFilter);
    return groupEventsIntoSessions(filtered, data.commitGroups, data.costSummary);
  }, [data.events, data.commitGroups, data.costSummary, agentFilter, timeRange]);

  // Group sessions by agent instead of project
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

  // Track new sessions for animations
  const prevSessionIds = useRef<Set<string>>(new Set());
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(agentGroups.flatMap((g) => g.sessions.map((s) => s.id)));
    const fresh = new Set<string>();
    for (const id of currentIds) { if (!prevSessionIds.current.has(id)) fresh.add(id); }
    prevSessionIds.current = currentIds;
    if (fresh.size > 0) { setNewSessionIds(fresh); setTimeout(() => setNewSessionIds(new Set()), 500); }
  }, [agentGroups]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const alertCount = data.collisions.length;
  const totalCost = data.costSummary.total_cost_usd;

  function handleDemoDismiss() {
    setDemoDismissed(true);
    localStorage.setItem("vigil-demo-dismissed", "true");
  }

  const showDemoBanner = (data.demoMode && !demoDismissed) || transitionMessage !== null;
  const showEmptyState = !data.connected && !data.demoMode;
  const hasContent = data.connected || data.demoMode;

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

      {showDemoBanner && (
        <DemoBanner
          onConnect={() => setShowSetup(true)}
          onDismiss={handleDemoDismiss}
          transitionMessage={transitionMessage}
        />
      )}

      <SetupModal open={showSetup} onClose={() => setShowSetup(false)} />

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {showEmptyState && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 rounded-lg bg-bg-secondary flex items-center justify-center mb-4 shadow-card">
              <span className="text-text-muted text-xl">V</span>
            </div>
            <p className="text-sm text-text-muted mb-3">Start the Vigil daemon to see agent activity</p>
            <code className="text-xs font-mono text-text-tertiary bg-bg-secondary px-4 py-2 rounded-md shadow-subtle selectable">
              vigil watch ~/projects
            </code>
          </div>
        )}

        {hasContent && agentGroups.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">No activity found</p>
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
