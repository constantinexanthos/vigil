import { useState } from "react";
import { agentColor, agentDisplayName, kindLabel, truncatePath } from "../types";
import type { AgentEvent } from "../types";

interface EventRowProps {
  event: AgentEvent;
  isNew: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function classifyDiffLine(line: string): string {
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  return "diff-ctx";
}

export default function EventRow({ event, isNew }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const color = agentColor(event.agent);
  const diffStats = event.diff ? parseDiffStats(event.diff) : null;

  return (
    <div
      className={`border-b border-border hover:bg-surface/60 transition-colors cursor-pointer w-full ${isNew ? "event-new" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-5 py-2">
        <span className="text-[10px] text-text-muted w-[56px] flex-shrink-0 font-mono">
          {formatTime(event.timestamp)}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color, backgroundColor: color + "10", border: `1px solid ${color}18` }}
        >
          {agentDisplayName(event.agent)}
        </span>
        <span className="text-[11px] text-text-secondary flex-shrink-0">
          {kindLabel(event.kind)}
        </span>
        {diffStats && (
          <span className="text-[10px] flex-shrink-0 flex gap-1 ml-1 font-mono">
            {diffStats.added > 0 && <span className="text-accent">+{diffStats.added}</span>}
            {diffStats.removed > 0 && <span className="text-danger">-{diffStats.removed}</span>}
          </span>
        )}
        <span
          className="text-[11px] text-text-primary truncate ml-auto font-mono"
          title={event.file_path ?? ""}
        >
          {event.file_path ? truncatePath(event.file_path) : "-"}
        </span>
      </div>
      {expanded && event.diff && (
        <div className="px-5 pb-3">
          <pre className="bg-bg rounded border border-border p-3 overflow-x-auto text-[10px] leading-relaxed max-h-[220px] overflow-y-auto font-mono">
            {event.diff.split("\n").map((line, i) => (
              <div key={i} className={classifyDiffLine(line)}>
                {line}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
