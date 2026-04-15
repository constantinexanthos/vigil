import { useState } from "react";
import SessionCard from "./SessionCard";
import type { ProjectGroup } from "../types";

interface ProjectSectionProps {
  project: ProjectGroup;
  newSessionIds?: Set<string>;
}

export default function ProjectSection({ project, newSessionIds }: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-2">
      {/* Project header */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-surface cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[13px] font-semibold text-text-heading">
          {project.project}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-muted">
            {project.agents.length} agent{project.agents.length !== 1 ? "s" : ""}
          </span>
          <svg
            className="w-3.5 h-3.5 text-text-muted"
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 150ms ease",
            }}
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Sessions */}
      {!collapsed && (
        <div
          className="session-expand session-expand-active"
          style={{ opacity: collapsed ? 0 : 1 }}
        >
          {project.sessions.map((session) => (
            <SessionCard key={session.id} session={session} isNew={newSessionIds?.has(session.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
