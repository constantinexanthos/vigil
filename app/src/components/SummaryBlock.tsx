import { AnimatePresence, motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import { humanModel, relativeTimeFromIso } from "../lib/formatters";
import type { HostKind } from "../types";

interface Props {
  summary: string | null;
  generatedAt: string | null;
  hostKind: HostKind;
  model: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  fallbackDescription?: string;
  hasCli: boolean;
}

export function SummaryBlock({
  summary, generatedAt, hostKind, model, onRefresh, isRefreshing, fallbackDescription, hasCli,
}: Props) {
  const token = hostToken(hostKind);
  const display = summary ?? fallbackDescription ?? "";

  return (
    <div
      className="px-5 py-4 border-b border-white/5"
      style={{ background: `linear-gradient(180deg, ${token.color}0F, transparent)` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] tracking-[0.08em] uppercase text-white/40 font-semibold">
          What's happening
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || !hasCli}
            className="text-[11px] text-white/50 hover:text-white/80 disabled:opacity-40 transition-colors"
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
          className="text-[13px] text-white/90 leading-relaxed"
        >
          {display
            ? display
            : hasCli
              ? <ShimmerLines />
              : <div className="text-white/55">Connect Claude or Codex in settings to see plain-English summaries of what the agent is doing.</div>}
        </motion.div>
      </AnimatePresence>
      {generatedAt && (
        <div className="mt-2 text-[11px] text-white/40">
          Generated {relativeTimeFromIso(generatedAt)}
          {model ? ` by ${humanModel(model)}` : null}
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

