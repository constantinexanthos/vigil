import { useState } from "react";
import AgentLogo from "./AgentLogo";
import SessionCard from "./SessionCard";
import { formatCost, relativeTime } from "../types";
import type { AgentGroup, Collision } from "../types";

interface AgentSectionProps {
  group: AgentGroup;
  newSessionIds: Set<string>;
  collisions: Collision[];
}

export default function AgentSection({ group, newSessionIds, collisions }: AgentSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: "8px" }}>
      {/* Agent header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          cursor: "pointer",
          background: "#151518",
          borderBottom: "1px solid #232530",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <AgentLogo agent={group.agent} />
          <span style={{ fontSize: "14px", fontWeight: 500, color: "#fafafa" }}>
            {group.displayName}
          </span>
          {group.isActive && (
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#4ade80",
              display: "inline-block",
              animation: "pulse-dot 2s ease-in-out infinite",
            }} />
          )}
          {!group.isActive && (
            <span style={{ fontSize: "11px", color: "#52525b" }}>idle</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "#71717a" }}>
            {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
          </span>
          {group.totalCost > 0 && (
            <span style={{ fontSize: "12px", color: "#71717a" }}>
              {formatCost(group.totalCost)}
            </span>
          )}
          <span style={{ fontSize: "11px", color: "#52525b" }}>
            {collapsed ? "▸" : "▾"}
          </span>
        </div>
      </div>

      {/* Sessions */}
      {!collapsed && (
        <div>
          {group.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isNew={newSessionIds.has(session.id)}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
