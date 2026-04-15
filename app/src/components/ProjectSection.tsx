import { useState, useMemo } from "react";
import SessionCard from "./SessionCard";
import CollisionCard from "./CollisionCard";
import type { ProjectGroup, Collision } from "../types";

interface ProjectSectionProps {
  project: ProjectGroup;
  newSessionIds?: Set<string>;
  collisions?: Collision[];
}

export default function ProjectSection({ project, newSessionIds, collisions }: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const { statusText, statusColor } = useMemo(() => {
    const warnings = project.sessions.filter((s) => s.confidence > 0 && s.confidence < 60).length;
    if (warnings > 0) {
      return {
        statusText: `${warnings} warning${warnings !== 1 ? "s" : ""}`,
        statusColor: "#fbbf24",
      };
    }
    return {
      statusText: "all green",
      statusColor: "#4ade80",
    };
  }, [project.sessions]);

  // Merge collision entries for this project
  const projectCollisions = useMemo(() => {
    if (!collisions || collisions.length === 0) return [];
    return collisions.filter((c) =>
      c.file_path.includes(project.repoPath) || project.sessions.some((s) =>
        s.files.some((f) => f.path === c.file_path),
      ),
    );
  }, [collisions, project.repoPath, project.sessions]);

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
            <span style={{ margin: "0 6px", opacity: 0.4 }}>{"\u2022"}</span>
            <span style={{ color: statusColor }}>{statusText}</span>
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

      {/* Sessions + Collisions */}
      {!collapsed && (
        <div
          className="session-expand session-expand-active"
          style={{ opacity: collapsed ? 0 : 1 }}
        >
          {/* Collision cards at the top of the project */}
          {projectCollisions.map((col) => (
            <CollisionCard
              key={`collision-${col.file_path}`}
              filePath={col.file_path}
              agents={col.agents}
              timestamp={new Date().toISOString()}
            />
          ))}
          {project.sessions.map((session) => (
            <SessionCard key={session.id} session={session} isNew={newSessionIds?.has(session.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
