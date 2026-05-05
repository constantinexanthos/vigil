import { AnimatePresence, motion } from "framer-motion";
import { relativeTimeFromIso } from "../lib/formatters";
import { modelLongName } from "../lib/model-tokens";
import { PulseLine } from "./PulseLine";
import { MilestoneFeed } from "./MilestoneFeed";
import type { HostKind, SessionTurn } from "../types";

interface Props {
  summary: string | null;
  generatedAt: string | null;
  hostKind: HostKind;
  model: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  fallbackDescription?: string;
  hasCli: boolean;
  /** Live session turns — newest at end. Drives PulseLine + MilestoneFeed. */
  turns: SessionTurn[];
  isLive: boolean;
}

export function SummaryBlock({
  summary, generatedAt, model, onRefresh, isRefreshing, fallbackDescription, hasCli, turns, isLive,
}: Omit<Props, "hostKind"> & { hostKind?: Props["hostKind"] }) {
  const latest = turns.length > 0 ? turns[turns.length - 1] : null;
  const hasLivePulse = isLive && (latest?.tool_names?.length ?? 0) > 0;
  const hasMilestones = turns.some((t) => t.role === "assistant" && t.text.trim().length > 0 && t.tool_names.length === 0);

  // Prefer the real summary. Only fall back to the session description when
  // we can't generate a better one — and don't show the fallback if it's just
  // the title above (duplicated text is noise). For closed sessions with no
  // cached summary AND nothing live, hide the block entirely — activity
  // stream below still shows the file-change trail.
  const displaySummary = summary ?? null;
  const shouldFallback = !displaySummary && !!fallbackDescription && fallbackDescription.trim().length > 0;
  const display = displaySummary ?? (shouldFallback ? fallbackDescription! : "");
  const showParagraph = !!displaySummary || (hasCli && isLive);

  if (!showParagraph && !hasLivePulse && !hasMilestones) {
    return null;
  }

  return (
    <div className="px-5 py-4">
      {showParagraph && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-label uppercase text-white/40 font-semibold">
              What's happening
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing || !hasCli}
                className="text-xs text-white/50 hover:text-white/80 disabled:opacity-40 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
              >
                {isRefreshing ? "refreshing…" : "refresh"}
              </button>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={display || "empty"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-base text-white/90 leading-relaxed"
            >
              {display
                ? display
                : hasCli
                  ? <ShimmerLines />
                  : <div className="text-white/55">Connect Claude or Codex to see plain-English summaries.</div>}
            </motion.div>
          </AnimatePresence>
        </>
      )}
      <PulseLine
        toolNames={latest?.tool_names ?? []}
        turnAt={latest?.timestamp ?? null}
        now={Date.now()}
        isLive={isLive}
      />
      <MilestoneFeed turns={turns} />
      {generatedAt && displaySummary && (
        <div className="mt-3 text-xs text-white/40">
          Generated {relativeTimeFromIso(generatedAt)}
          {model ? ` by ${modelLongName(model)}` : null}
        </div>
      )}
    </div>
  );
}

function ShimmerLines() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 rounded bg-white/6 animate-pulse w-[92%]" />
      <div className="h-3 rounded bg-white/6 animate-pulse w-[78%]" />
      <div className="h-3 rounded bg-white/6 animate-pulse w-[64%]" />
    </div>
  );
}
