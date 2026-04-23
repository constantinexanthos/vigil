import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ActivityStream } from "../ActivityStream";
import { SessionFooter } from "../SessionFooter";
import { SessionHeader } from "../SessionHeader";
import { SummaryBlock } from "../SummaryBlock";
import type { SessionGroup, SessionTurn } from "../../types";
import type { ServerSummary } from "../../hooks";

interface Props {
  session: SessionGroup | null;
  hasCli: boolean;
  /** Latest cached summary for `session`, supplied by useDaemonData's unified polling. */
  summary: ServerSummary | null;
  /** Recent turns for the selected session — drives PulseLine + MilestoneFeed in SummaryBlock. */
  turns: SessionTurn[];
}

export function MiddlePane({ session, hasCli, summary, turns }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <span
          aria-hidden
          className="w-3 h-3 rounded-full bg-white/25 mb-4 animate-pulse-alive"
        />
        <div className="text-title text-white/75 mb-1">No agents active</div>
        <div className="text-[12px] text-white/45 leading-relaxed max-w-[280px]">
          Vigil will light up when you start Claude Code, Cursor, or Codex in a terminal.
        </div>
      </div>
    );
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
    <section className="h-full flex flex-col bg-[#121214]">
      <SessionHeader session={session} />
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
      <ActivityStream session={session} />
      <SessionFooter session={session} />
    </section>
  );
}
