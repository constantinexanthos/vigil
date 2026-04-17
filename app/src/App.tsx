import { useState, useMemo, useEffect } from "react";
import { useDaemonData } from "./hooks";
import { TopBar } from "./components/TopBar";
import { ThreePaneGrid } from "./components/layout/ThreePaneGrid";
import { LeftRail } from "./components/layout/LeftRail";
import { MiddlePane } from "./components/layout/MiddlePane";
import { RightRail } from "./components/layout/RightRail";
import { Onboarding } from "./components/Onboarding";
import CommandPalette from "./components/CommandPalette";
import { useSelection } from "./store/selection";
import { groupEventsIntoSessions, enrichSessionsWithLiveData } from "./types";

export default function App() {
  const data = useDaemonData();
  const [cmdOpen, setCmdOpen] = useState(false);
  const selectedId = useSelection((s) => s.selectedSessionId);

  const sessions = useMemo(() => {
    const projects = groupEventsIntoSessions(data.events, data.commitGroups, data.costSummary);
    const enriched = enrichSessionsWithLiveData(projects, data.liveSessions ?? []);
    return enriched.flatMap((p) => p.sessions);
  }, [data.events, data.commitGroups, data.costSummary, data.liveSessions]);

  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
  const hasCli = data.cli.claude || data.cli.codex;
  const needsOnboarding = !hasCli && !data.demoMode;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col text-white">
      {!data.connected && (
        <div className="bg-rose-500/10 border-b border-rose-400/20 px-3.5 py-1 text-[11px] text-rose-200 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          <span>Daemon not reachable · last seen {data.error ?? "never"}</span>
        </div>
      )}
      <TopBar
        connected={data.connected}
        hasNewEvents={data.hasNewEvents}
        onOpenCmd={() => setCmdOpen(true)}
      />
      <div className="flex-1 overflow-hidden">
        {needsOnboarding ? (
          <Onboarding cli={data.cli} />
        ) : (
          <ThreePaneGrid
            left={<LeftRail sessions={sessions} />}
            middle={<MiddlePane session={selected} hasCli={hasCli} summary={data.currentSummary} />}
            right={<RightRail session={selected} />}
          />
        )}
      </div>
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        agents={data.activeAgents}
        onSelectAgent={(_a) => setCmdOpen(false)}
        onClearFilter={() => setCmdOpen(false)}
      />
    </div>
  );
}
