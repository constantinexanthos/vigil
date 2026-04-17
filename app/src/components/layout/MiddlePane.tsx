import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ActivityStream } from "../ActivityStream";
import { SessionFooter } from "../SessionFooter";
import { SessionHeader } from "../SessionHeader";
import { SummaryBlock } from "../SummaryBlock";
import type { SessionGroup } from "../../types";

interface Props {
  session: SessionGroup | null;
  hasCli: boolean;
}

interface ServerSummary {
  text: string;
  generated_at: string;
  backend: string;
  stale_seconds: number;
}

export function MiddlePane({ session, hasCli }: Props) {
  const [summary, setSummary] = useState<ServerSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSummary(null);
    if (!session) return;
    const sessionId = session.id;
    let cancelled = false;
    async function load() {
      try {
        const res = await invoke<ServerSummary | null>("get_summary", { sessionId });
        if (!cancelled) setSummary(res);
      } catch (_) {
        if (!cancelled) setSummary(null);
      }
    }
    load();
    const id = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [session?.id]);

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
      window.setTimeout(async () => {
        try {
          const res = await invoke<ServerSummary | null>("get_summary", { sessionId: session.id });
          setSummary(res);
        } finally {
          setRefreshing(false);
        }
      }, 1500);
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
