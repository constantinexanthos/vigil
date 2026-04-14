import { useState } from "react";
import Header from "./components/Header";
import WorkspaceSummaryView from "./components/WorkspaceSummary";
import ActiveAgents from "./components/ActiveAgents";
import CollisionBanner from "./components/CollisionBanner";
import CommitTimeline from "./components/CommitTimeline";
import EventTimeline from "./components/EventTimeline";
import ErrorState from "./components/ErrorState";
import { useDaemonData } from "./hooks";

type Tab = "commits" | "monitor";

export default function App() {
  const {
    events,
    collisions,
    agentStats,
    eventCount,
    costSummary,
    connected,
    error,
    agentActivity,
    newEventIds,
    commitGroups,
    workspaceSummary,
  } = useDaemonData();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("commits");

  function handleSelectAgent(agent: string) {
    setSelectedAgent((prev) => (prev === agent ? null : agent));
  }

  if (error && !connected) {
    return (
      <div className="h-screen bg-bg flex flex-col">
        <Header eventCount={0} connected={false} agentCount={0} totalCostUsd={0} />
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="h-screen bg-bg flex flex-col">
      <Header
        eventCount={eventCount}
        connected={connected}
        agentCount={agentStats.length}
        totalCostUsd={costSummary.total_cost_usd}
      />

      {/* Tab bar */}
      <div className="flex border-b border-border px-3">
        {(["commits", "monitor"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
              tab === t
                ? "text-accent border-b border-accent"
                : "text-text-muted hover:text-text-secondary border-b border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "commits" && (
        <>
          <WorkspaceSummaryView summary={workspaceSummary} />
          <CommitTimeline commits={commitGroups} />
        </>
      )}

      {tab === "monitor" && (
        <>
          <ActiveAgents
            agentStats={agentStats}
            collisions={collisions}
            agentActivity={agentActivity}
            agentCosts={costSummary.agents}
            selectedAgent={selectedAgent}
            onSelectAgent={handleSelectAgent}
          />
          <CollisionBanner collisions={collisions} />
          <EventTimeline
            events={events}
            agentFilter={selectedAgent}
            newEventIds={newEventIds}
          />
        </>
      )}
    </div>
  );
}
