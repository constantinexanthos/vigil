import { useState } from "react";
import { agentColor, agentDisplayName, relativeTime, confidenceColor, formatCost, truncatePath } from "../types";
import type { CommitGroup } from "../types";

interface Props {
  commit: CommitGroup;
}

function kindSymbol(kind: string): { char: string; color: string } {
  if (kind.includes("create")) return { char: "+", color: "#4ade80" };
  if (kind.includes("delete")) return { char: "-", color: "#ef4444" };
  return { char: "~", color: "#22d3ee" };
}

export default function CommitCard({ commit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = agentColor(commit.agent);
  const confColor = confidenceColor(commit.confidence_score);

  return (
    <div
      className="border-b border-border px-4 py-3 hover:bg-surface/50 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5"
          style={{ color, backgroundColor: color + "15", border: `1px solid ${color}30` }}
        >
          {agentDisplayName(commit.agent)}
        </span>
        <p className="text-[13px] text-text-primary leading-snug flex-1">
          {commit.commit_message || "(no message)"}
        </p>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted ml-0.5">
        <span>{relativeTime(commit.timestamp)}</span>
        {commit.files.length > 0 && (
          <span>{commit.files.length} file{commit.files.length !== 1 ? "s" : ""}</span>
        )}
        <span
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ backgroundColor: confColor }}
          title={`Confidence: ${commit.confidence_score}`}
        />
        {commit.cost_usd > 0 && (
          <span className="text-text-muted">{formatCost(commit.cost_usd)}</span>
        )}
        <span className="font-mono text-text-muted/50">{commit.commit_hash.slice(0, 7)}</span>
      </div>
      {expanded && commit.files.length > 0 && (
        <div className="mt-2.5 ml-1 space-y-0.5">
          {commit.files.map((file, i) => {
            const ks = kindSymbol(file.kind);
            return (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="font-mono font-bold w-3 text-center" style={{ color: ks.color }}>
                  {ks.char}
                </span>
                <span className="font-mono text-text-secondary truncate flex-1">
                  {truncatePath(file.path)}
                </span>
                {(file.added > 0 || file.removed > 0) && (
                  <span className="flex gap-1 flex-shrink-0">
                    {file.added > 0 && <span className="text-[#4ade80]">+{file.added}</span>}
                    {file.removed > 0 && <span className="text-danger">-{file.removed}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
