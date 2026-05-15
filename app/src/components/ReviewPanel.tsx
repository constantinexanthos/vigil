import { ConfidenceDonut } from "./ConfidenceDonut";
import type { ReviewSignals } from "../types";

interface Props {
  signals: ReviewSignals | null;
}

// ReviewPanel surfaces confidence + collisions. Mirror the polished
// CollisionBanner pattern: 2px left bad-accent border, no filled bar, body
// text in ink + meta in mute. Confidence header reads like a stat-block.
export function ReviewPanel({ signals }: Props) {
  if (!signals) {
    return (
      <div className="px-4 py-2 text-[12px] text-vigil-mute">Analyzing…</div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-vigil-rule">
        <ConfidenceDonut score={signals.confidence} />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute">
            Confidence
          </div>
          <div className="text-[12px] text-vigil-ink mt-0.5 leading-snug">
            {signals.confidence_reason}
          </div>
        </div>
      </div>

      {signals.collisions.length > 0 && (
        <div>
          {signals.collisions.map((c) => (
            <div
              key={c.file_path}
              className="border-l-2 border-bad border-b border-vigil-rule px-4 py-2"
            >
              <div className="text-[11px] text-bad uppercase tracking-[0.10em] flex items-center gap-1.5">
                Collision · {c.agents.length} agents
              </div>
              <div className="text-[11.5px] text-vigil-ink mt-0.5 font-mono truncate">
                {c.file_path}
              </div>
              <div className="text-[10.5px] text-vigil-mute mt-0.5 font-mono truncate">
                {c.agents.join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2 text-[11px] text-vigil-mute flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
        <span>{signals.file_count} files</span>
        {signals.has_tests && <span>✓ tests added</span>}
        {signals.collisions.length === 0 && <span>✓ no collisions</span>}
      </div>
    </div>
  );
}
