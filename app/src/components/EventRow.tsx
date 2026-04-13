import { useState, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-diff";
import { agentColor } from "../types";
import type { AgentEvent } from "../types";

interface EventRowProps {
  event: AgentEvent;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncatePath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

export default function EventRow({ event }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const color = agentColor(event.agent);

  useEffect(() => {
    if (expanded && codeRef.current && event.diff) {
      Prism.highlightElement(codeRef.current);
    }
  }, [expanded, event.diff]);

  return (
    <div
      className="border-b border-border hover:bg-surface transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="text-[10px] text-text-muted w-[60px] flex-shrink-0 font-mono">
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
        <span className="text-[10px] text-text-primary truncate ml-auto">
          {truncatePath(event.file_path)}
        </span>
      </div>
      {expanded && event.diff && (
        <div className="px-4 pb-3">
          <pre className="bg-bg rounded border border-border p-2 overflow-x-auto text-[10px] leading-relaxed max-h-[200px] overflow-y-auto">
            <code ref={codeRef} className="language-diff">
              {event.diff}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
