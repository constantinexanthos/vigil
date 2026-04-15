import { useState } from "react";
import { agentColor, kindIcon, truncatePath } from "../types";
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

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  const lines = diff.split("\n");
  for (const line of lines) {
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
  const icon = kindIcon(event.kind);
  const diffStats = event.diff ? parseDiffStats(event.diff) : null;

  return (
    <div
      className={`border-b border-border hover:bg-surface transition-colors cursor-pointer ${isNew ? "event-new event-flash" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
          style={{
            color: icon.color,
            backgroundColor: icon.color + "18",
            border: `1px solid ${icon.color}35`,
          }}
          title={event.kind}
        >
          {icon.symbol}
        </span>
        <span className="text-[10px] text-text-muted w-[52px] flex-shrink-0 font-mono">
          {formatTime(event.timestamp)}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color, backgroundColor: color + "15", border: `1px solid ${color}30` }}
        >
          {event.agent}
        </span>
        <span className="text-[10px] text-text-secondary flex-shrink-0">
          {kindLabel(event.kind)}
        </span>
        {diffStats && (
          <span className="text-[9px] flex-shrink-0 flex gap-1 ml-1">
            {diffStats.added > 0 && <span className="text-accent">+{diffStats.added}</span>}
            {diffStats.removed > 0 && <span className="text-danger">-{diffStats.removed}</span>}
          </span>
        )}
        <span className="text-[10px] text-text-primary truncate ml-auto">
          {event.file_path ? truncatePath(event.file_path) : "-"}
        </span>
      </div>
      {expanded && event.diff && (
        <div className="px-4 pb-3">
          <pre className="bg-bg rounded border border-border p-2 overflow-x-auto text-[10px] leading-relaxed max-h-[200px] overflow-y-auto">
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
