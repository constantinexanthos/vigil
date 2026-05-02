import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionFooter } from "../SessionFooter";
import { SessionHeader } from "../SessionHeader";
import { SummaryBlock } from "../SummaryBlock";
import { OverviewPane } from "./overview/OverviewPane";
import type {
  SessionGroup,
  SessionTurn,
  LiveSessionRow,
  Collision,
  FileHeat,
  HourBucket,
} from "../../types";
import type { ServerSummary } from "../../hooks";

interface Props {
  session: SessionGroup | null;
  hasCli: boolean;
  /** Latest cached summary for `session`, supplied by useDaemonData's unified polling. */
  summary: ServerSummary | null;
  /** Recent turns for the selected session — drives PulseLine + MilestoneFeed in SummaryBlock. */
  turns: SessionTurn[];
  viewMode: "overview" | "session";
  overviewData: {
    liveSessions: LiveSessionRow[];
    collisions: Collision[];
    topEditedFiles: FileHeat[];
    hourlyActivity: HourBucket[];
    burnRatePerHour: number | null;
    activeAgents: number;
    totalAgents: number;
    filesToday: number;
  };
  onSelect: (sessionId: string) => void;
}

export function MiddlePane({ session, hasCli, summary, turns, viewMode, overviewData, onSelect }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  if (viewMode === "overview" || !session) {
    // The existing "No agents active" hero is for truly no data anywhere.
    // With agents in liveSessions OR any activity today, show Overview instead.
    const hasAnyData =
      overviewData.liveSessions.length > 0 ||
      overviewData.activeAgents > 0 ||
      overviewData.filesToday > 0;
    if (!hasAnyData && !session) {
      // Keep showing the existing No-agents-active hero — no overview content at all.
      return <NoAgentsHero />;
    }
    return <OverviewPane {...overviewData} onSelect={onSelect} />;
  }

  async function onRefresh() {
    if (!session || refreshing) return;
    setRefreshing(true);
    try {
      await invoke("refresh_summary", { sessionId: session.id });
      // The next useDaemonData poll (2s cadence) picks up the regenerated summary.
      // Hold the refreshing flag briefly so the UI shows feedback.
      window.setTimeout(() => setRefreshing(false), 2500);
    } catch {
      setRefreshing(false);
    }
  }

  return (
    <section className="h-full flex flex-col">
      <SessionHeader session={session} />
      <div className="flex-1 overflow-y-auto">
        <SummaryBlock
          summary={summary?.text ?? session.summaryPlainEnglish ?? null}
          generatedAt={summary?.generated_at ?? session.summaryGeneratedAt ?? null}
          hostKind={session.hostKind}
          model={session.model}
          onRefresh={onRefresh}
          isRefreshing={refreshing}
          fallbackDescription={session.description}
          hasCli={hasCli}
          turns={turns}
          isLive={session.isLive}
        />
        {!summary?.text && !session.summaryPlainEnglish && !session.isLive && (
          <ClosedSessionEmpty fileCount={session.files.length} />
        )}
      </div>
      <SessionFooter session={session} />
    </section>
  );
}

function ClosedSessionEmpty({ fileCount }: { fileCount: number }) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="text-[12.5px] text-white/55 leading-relaxed max-w-[360px] mx-auto">
        No live summary was captured for this session.
        <br />
        {fileCount > 0
          ? <>Open the <span className="text-white/80 font-medium">Files</span> tab to see what changed.</>
          : <>Nothing was changed.</>}
      </div>
    </div>
  );
}

function NoAgentsHero() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <span
        aria-hidden
        className="w-3 h-3 rounded-full bg-white/25 mb-4 animate-pulse-alive"
      />
      <div className="text-title text-white/75 mb-1">No agents active</div>
      <div className="text-sm text-white/45 leading-relaxed max-w-[280px]">
        Vigil will light up when you start Claude Code, Cursor, or Codex in a terminal.
      </div>
    </div>
  );
}
