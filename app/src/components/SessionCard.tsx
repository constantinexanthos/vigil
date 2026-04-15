import { useState } from "react";
import AgentLogo from "./AgentLogo";
import SessionDetail from "./SessionDetail";
import { agentDisplayName, relativeTime, formatCost } from "../types";
import type { SessionGroup } from "../types";

interface SessionCardProps {
  session: SessionGroup;
}

export default function SessionCard({ session }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statsText = [
    `${session.files.length} file${session.files.length !== 1 ? "s" : ""}`,
    session.confidence > 0 ? `Confidence ${session.confidence}` : null,
    session.costUsd > 0 ? formatCost(session.costUsd) : null,
  ]
    .filter(Boolean)
    .join(" \u2022 ");

  return (
    <div className="border-b border-border">
      <div
        className="py-4 px-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Row 1: Agent logo + name + timestamp */}
        <div className="flex items-center gap-2 mb-1.5">
          <AgentLogo agent={session.agent} />
          <span className="text-[13px] text-text-primary">
            {agentDisplayName(session.agent)}
          </span>
          <span className="text-[12px] text-text-faint ml-auto">
            {relativeTime(session.endTime)}
          </span>
        </div>

        {/* Row 2: Description */}
        <p className="text-[14px] text-text-primary mb-1 pl-6">
          {session.description}
        </p>

        {/* Row 3: Stats */}
        <div className="flex items-center gap-1.5 pl-6">
          {session.hasWarning && (
            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
          )}
          <span className="text-[12px] text-text-muted">{statsText}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && <SessionDetail session={session} />}
    </div>
  );
}
