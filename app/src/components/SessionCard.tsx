import { useState } from "react";
import AgentLogo from "./AgentLogo";
import SessionDetail from "./SessionDetail";
import { agentDisplayName, relativeTime } from "../types";
import type { SessionGroup } from "../types";

interface SessionCardProps {
  session: SessionGroup;
  isNew?: boolean;
}

function confidenceBorder(score: number): string {
  if (score >= 80) return "2px solid #4ade80";
  if (score >= 60) return "2px solid #fbbf24";
  if (score >= 40) return "2px solid #f97316";
  if (score > 0) return "2px solid #ef4444";
  return "none";
}

export default function SessionCard({ session, isNew }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
<div
      className={`border-b border-border${isNew ? " session-new" : ""}`}
      style={{ borderLeft: confidenceBorder(session.confidence) }}
    >
      {/* Collapsed: two lines only */}
      <div
        className="py-3 px-4 cursor-pointer hover:bg-surface transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Line 1: Agent + commit message + timestamp + chevron */}
        <div className="flex items-center gap-2">
          <AgentLogo agent={session.agent} />
          <span className="text-[13px] text-text-primary flex-shrink-0">
            {agentDisplayName(session.agent)}
          </span>
          <span className="text-[14px] text-text-primary truncate flex-1 ml-1">
            {session.description}
          </span>
          <span className="text-[12px] text-text-faint flex-shrink-0 ml-2">
            {relativeTime(session.endTime)}
          </span>
          <span
            style={{
              color: "#52525b",
              fontSize: "12px",
              flexShrink: 0,
              marginLeft: "4px",
              transition: "transform 150ms ease",
              display: "inline-block",
            }}
          >
            {expanded ? "\u25BE" : "\u25B8"}
          </span>
        </div>

        {/* Line 2: Stats (confidence removed from here) */}
        <div className="flex items-center gap-1.5 pl-6 mt-1">
          {session.hasWarning && (
            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
          )}
          <span className="text-[12px] text-text-muted">
            {session.files.length} file{session.files.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      <div
        className="session-expand"
        style={{
          opacity: expanded ? 1 : 0,
          maxHeight: expanded ? "2000px" : "0",
          overflow: expanded ? "visible" : "hidden",
        }}
      >
        {expanded && <SessionDetail session={session} />}
      </div>
    </div>
  );
}
