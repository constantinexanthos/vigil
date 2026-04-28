import { ConfidenceDonut } from "./ConfidenceDonut";
import type { ReviewSignals } from "../types";

interface Props {
  signals: ReviewSignals | null;
}

export function ReviewPanel({ signals }: Props) {
  if (!signals) {
    return (
      <div className="px-4 py-5 text-sm text-white/45">
        Analyzing…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex items-center gap-3 pb-3 border-b border-white/5 mb-3">
        <ConfidenceDonut score={signals.confidence} />
        <div className="min-w-0">
          <div className="text-sm text-white/85 font-semibold">Confidence</div>
          <div className="text-xs text-white/55 mt-0.5 leading-snug">
            {signals.confidence_reason}
          </div>
        </div>
      </div>

      {signals.collisions.length > 0 && (
        <div className="space-y-2 mb-3">
          {signals.collisions.map((c) => (
            <div
              key={c.file_path}
              className="bg-bad/8 border-l-2 border-bad rounded-sm px-3 py-2"
            >
              <div className="text-xs font-semibold text-red-200 flex items-center gap-1.5">
                <span aria-hidden>▲</span>
                <span>Collision · {c.agents.length} agents on <span className="font-mono">{c.file_path}</span></span>
              </div>
              <div className="text-[10.5px] text-white/55 mt-1 font-mono">
                Editors: {c.agents.join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-white/45 pt-2 border-t border-white/5 flex flex-wrap gap-x-3 gap-y-1">
        <span>{signals.file_count} files</span>
        {signals.has_tests && <span>✓ tests added</span>}
        {signals.collisions.length === 0 && <span>✓ no collisions</span>}
      </div>
    </div>
  );
}
