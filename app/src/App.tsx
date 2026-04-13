import Header from "./components/Header";
import ActiveAgents from "./components/ActiveAgents";
import EventTimeline from "./components/EventTimeline";
import ErrorState from "./components/ErrorState";
import { useDaemonData } from "./hooks";

export default function App() {
  const { events, activeAgents, collisions, agentStats, eventCount, connected, error } =
    useDaemonData();

  if (error && !connected) {
    return (
      <div className="h-screen bg-bg flex flex-col font-mono">
        <Header eventCount={0} connected={false} />
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="h-screen bg-bg flex flex-col font-mono">
      <Header eventCount={eventCount} connected={connected} />
      <ActiveAgents agentStats={agentStats} collisions={collisions} />
      <EventTimeline events={events} activeAgents={activeAgents} />
    </div>
  );
}
