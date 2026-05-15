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
  turns: SessionTurn[];
  isLive: boolean;
}

// SummaryBlock is the plain-English summary at the top of session detail.
// Drops the framer-motion fade for two reasons: the surrounding feed is
// quiet enough that a fade adds visual jitter rather than polish, and the
// motion library was being imported just for this one effect.
export function SummaryBlock({
  summary,
  generatedAt,
  model,
  onRefresh,
  isRefreshing,
  fallbackDescription,
  hasCli,
  turns,
  isLive,
}: Omit<Props, "hostKind"> & { hostKind?: Props["hostKind"] }) {
  const latest = turns.length > 0 ? turns[turns.length - 1] : null;
  const hasLivePulse = isLive && (latest?.tool_names?.length ?? 0) > 0;
  const hasMilestones = turns.some(
    (t) =>
      t.role === "assistant" &&
      t.text.trim().length > 0 &&
      t.tool_names.length === 0,
  );

  const displaySummary = summary ?? null;
  const shouldFallback =
    !displaySummary && !!fallbackDescription && fallbackDescription.trim().length > 0;
  const display = displaySummary ?? (shouldFallback ? fallbackDescription! : "");
  const showParagraph = !!displaySummary || (hasCli && isLive);

  if (!showParagraph && !hasLivePulse && !hasMilestones) {
    return null;
  }

  return (
    <div className="px-4 py-3">
      {showParagraph && (
        <>
          <div className="flex items-center justify-between mb-2 h-6">
            <span className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute">
              What's happening
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing || !hasCli}
                className="text-[11px] text-vigil-mute hover:text-vigil-ink disabled:opacity-40 transition-colors duration-fast font-mono"
              >
                {isRefreshing ? "refreshing…" : "refresh"}
              </button>
            )}
          </div>
          <div className="text-[13px] text-vigil-ink leading-relaxed">
            {display ? (
              display
            ) : hasCli ? (
              <ShimmerLines />
            ) : (
              <span className="text-vigil-mute">
                Connect Claude or Codex to see plain-English summaries.
              </span>
            )}
          </div>
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
        <div className="mt-3 text-[10px] text-vigil-mute font-mono tabular-nums">
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
      <div className="h-3 rounded bg-vigil-surface animate-pulse w-[92%]" />
      <div className="h-3 rounded bg-vigil-surface animate-pulse w-[78%]" />
      <div className="h-3 rounded bg-vigil-surface animate-pulse w-[64%]" />
    </div>
  );
}
