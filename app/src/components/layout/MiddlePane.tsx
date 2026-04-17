import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ActivityStream } from "../ActivityStream";
import { SessionFooter } from "../SessionFooter";
import { SessionHeader } from "../SessionHeader";
import { SummaryBlock } from "../SummaryBlock";
import type { SessionGroup } from "../../types";
import type { ServerSummary } from "../../hooks";

interface Props {
  session: SessionGroup | null;
  hasCli: boolean;
  /** Latest cached summary for `session`, supplied by useDaemonData's unified polling. */
  summary: ServerSummary | null;
}

export function MiddlePane({ session, hasCli, summary }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-[#121214]">
        <div className="text-center max-w-sm px-6">
          <div className="text-[14px] text-white/75 mb-1.5">No session selected</div>
          <div className="text-[12px] text-white/45">
            Pick a session from the left, or start one in Claude Code / Conductor / Cursor.
          </div>
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
      />
      <ActivityStream session={session} />
      <SessionFooter session={session} />
    </section>
  );
}
