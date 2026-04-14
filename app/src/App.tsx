import { useState } from "react";
import Header from "./components/Header";
import ActiveAgents from "./components/ActiveAgents";
import CollisionBanner from "./components/CollisionBanner";
import EventTimeline from "./components/EventTimeline";
import ErrorState from "./components/ErrorState";
import { useDaemonData } from "./hooks";

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
  } = useDaemonData();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  function handleSelectAgent(agent: string) {
    setSelectedAgent((prev) => (prev === agent ? null : agent));
  }

  if (error && !connected) {
    return (
      <div className="h-screen bg-bg flex flex-col font-mono">
        <Header eventCount={0} connected={false} agentCount={0} totalCostUsd={0} />
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="h-screen bg-bg flex flex-col font-mono">
      <Header
        eventCount={eventCount}
        connected={connected}
        agentCount={agentStats.length}
        totalCostUsd={costSummary.total_cost_usd}
      />
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
    </div>
  );
}
