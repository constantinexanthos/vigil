import { useState, useMemo, useEffect, useRef } from "react";
import { useDaemonData } from "./hooks";
import { TopBar } from "./components/TopBar";
import { ThreePaneGrid } from "./components/layout/ThreePaneGrid";
import { LeftRail } from "./components/layout/LeftRail";
import { MiddlePane } from "./components/layout/MiddlePane";
import { RightRail } from "./components/layout/RightRail";
import { Onboarding } from "./components/Onboarding";
import CommandPalette from "./components/CommandPalette";
import { ProxyPane } from "./components/proxy/ProxyPane";
import { useSelection } from "./store/selection";
import { groupEventsIntoSessions, enrichSessionsWithLiveData } from "./types";

export default function App() {
  const data = useDaemonData();
  const [cmdOpen, setCmdOpen] = useState(false);
  const selectedId = useSelection((s) => s.selectedSessionId);
  const viewMode = useSelection((s) => s.viewMode);
  const setViewMode = useSelection((s) => s.setViewMode);
  const setSelected = useSelection((s) => s.setSelected);

  const sessions = useMemo(() => {
    const projects = groupEventsIntoSessions(data.events, data.commitGroups, data.costSummary);
    const enriched = enrichSessionsWithLiveData(projects, data.liveSessions ?? []);
    return enriched.flatMap((p) => p.sessions);
  }, [data.events, data.commitGroups, data.costSummary, data.liveSessions]);

  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
  const hasCli = data.cli.claude || data.cli.codex;
  const needsOnboarding = !hasCli && !data.demoMode;

  // Launch resolution: if persisted session is dead, snap to overview.
  // Ref-gated to fire exactly once after the first successful daemon fetch — running
  // pre-fetch (when sessions[] is still empty) would snap every persisted session to
  // overview, including valid live ones (spec Q4: live → restore per-session view).
  const launchResolved = useRef(false);
  useEffect(() => {
    if (launchResolved.current) return;
    if (!data.connected) return; // wait for first successful fetch (flips true even with zero sessions)
    launchResolved.current = true;
    if (selectedId) {
      const s = sessions.find((x) => x.id === selectedId);
      if (!s || !s.isLive) {
        setSelected(null);
        setViewMode("overview");
      }
    }
  }, [data.connected, sessions, selectedId, setSelected, setViewMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "k") { e.preventDefault(); setCmdOpen(true); return; }
      if (e.key === "1") { e.preventDefault(); setViewMode("overview"); return; }
      if (e.key === "2" && selected) { e.preventDefault(); setViewMode("session"); return; }
      if (e.key === "3") { e.preventDefault(); setViewMode("proxy"); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, setViewMode]);

  const overviewData = {
    liveSessions: data.liveSessions ?? [],
    collisions: data.collisions ?? [],
    topEditedFiles: data.topEditedFiles ?? [],
    hourlyActivity: data.hourlyActivity ?? [],
    burnRatePerHour: null,  // V3: not yet sourced from query_live_summary; null = render em-dash
    // Distinct live agents — must match AgentGrid's card cardinality (one card per agent
    // grouped from liveSessions filtered by is_live).
    activeAgents: new Set((data.liveSessions ?? []).filter((s) => s.is_live).map((s) => s.agent)).size,
    totalAgents: data.agentStats?.length ?? 0,
    filesToday: data.workspaceSummary?.files_changed_today ?? 0,
  };

  function onAgentSelect(sessionId: string) {
    setSelected(sessionId);
    setViewMode("session");
  }

  return (
    <div className="h-screen w-screen flex flex-col text-vigil-ink">
      {!data.connected && (
        <div className="h-6 px-4 text-[11px] text-vigil-ink flex items-center gap-2 border-l-2 border-bad border-b border-vigil-rule">
          <span className="w-1 h-1 rounded-full bg-bad animate-pulse-alive" />
          <span>
            Daemon not reachable · last seen{" "}
            <span className="text-vigil-mute">{data.error ?? "never"}</span>
          </span>
          <button
            type="button"
            className="ml-auto text-vigil-mute hover:text-vigil-ink transition-colors duration-fast"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}
      <TopBar
        connected={data.connected}
        hasNewEvents={data.hasNewEvents}
        onOpenCmd={() => setCmdOpen(true)}
        viewMode={viewMode}
        setViewMode={setViewMode}
        hasSelectedSession={selected != null}
      />
      <div className="flex-1 overflow-hidden">
        {needsOnboarding ? (
          <Onboarding cli={data.cli} />
        ) : viewMode === "proxy" ? (
          <ProxyPane />
        ) : (
          <ThreePaneGrid
            left={<LeftRail sessions={sessions} />}
            middle={
              <MiddlePane
                session={selected}
                hasCli={hasCli}
                summary={data.currentSummary}
                turns={data.recentTurns}
                viewMode={viewMode}
                overviewData={overviewData}
                onSelect={onAgentSelect}
              />
            }
            right={selected ? <RightRail session={selected} reviewSignals={data.reviewSignals} /> : null}
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
