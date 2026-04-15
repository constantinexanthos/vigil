import { useState } from "react";
import AgentLogo from "./AgentLogo";
import SessionDetail from "./SessionDetail";
import { agentDisplayName, relativeTime } from "../types";
import type { SessionGroup } from "../types";

interface SessionCardProps {
  session: SessionGroup;
}

export default function SessionCard({ session }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border">
      {/* Collapsed: two lines only */}
      <div
        className="py-3 px-4 cursor-pointer hover:bg-surface transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Line 1: Agent + commit message + timestamp */}
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
        </div>

        {/* Line 2: Stats */}
        <div className="flex items-center gap-1.5 pl-6 mt-1">
          {session.hasWarning && (
            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
          )}
          <span className="text-[12px] text-text-muted">
            {session.files.length} file{session.files.length !== 1 ? "s" : ""}
            {session.confidence > 0 && (
              <> {"\u2022"} Confidence {session.confidence}</>
            )}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && <SessionDetail session={session} />}
    </div>
  );
}
