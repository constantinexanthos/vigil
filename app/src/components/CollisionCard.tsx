import AgentLogo from "./AgentLogo";
import { agentDisplayName, relativeTime } from "../types";

interface CollisionCardProps {
  filePath: string;
  agents: string[];
  timestamp: string;
}

export default function CollisionCard({ filePath, agents, timestamp }: CollisionCardProps) {
  return (
    <div
      style={{
        borderLeft: "2px solid #fbbf24",
        borderBottom: "1px solid #1e1e21",
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "#fbbf24", fontSize: "14px", flexShrink: 0 }}>
          {"\u26A0"}
        </span>
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: "13px",
            color: "#a1a1aa",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {filePath}
        </span>
        <span style={{ fontSize: "12px", color: "#52525b", flexShrink: 0 }}>
          {relativeTime(timestamp)}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginTop: "6px",
          paddingLeft: "22px",
        }}
      >
        {agents.map((agent) => (
          <div
            key={agent}
            style={{ display: "flex", alignItems: "center", gap: "4px" }}
          >
            <AgentLogo agent={agent} />
            <span style={{ fontSize: "12px", color: "#d4d4d8" }}>
              {agentDisplayName(agent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
