import AgentLogo from "./AgentLogo";
import { agentDisplayName, truncatePath, formatCost } from "../types";
import type { AgentEvent, CostSummary } from "../types";

interface LivePulseProps {
  events: AgentEvent[];
  costSummary: CostSummary;
}

export default function LivePulse({ events, costSummary }: LivePulseProps) {
  const now = Date.now();
  const ACTIVE_WINDOW_MS = 120_000; // 2 minutes

  // Group events by agent, keep only those with events in the last 2 minutes
  const agentLatest = new Map<string, { agent: string; filePath: string | null; timestamp: number }>();
  for (const evt of events) {
    const evtTime = new Date(evt.timestamp).getTime();
    if (now - evtTime > ACTIVE_WINDOW_MS) continue;
    const existing = agentLatest.get(evt.agent);
    if (!existing || evtTime > existing.timestamp) {
      agentLatest.set(evt.agent, {
        agent: evt.agent,
        filePath: evt.file_path,
        timestamp: evtTime,
      });
    }
  }

  if (agentLatest.size === 0) return null;

  const costByAgent = new Map<string, number>();
  for (const ac of costSummary.agents) {
    costByAgent.set(ac.agent, ac.total_cost_usd);
  }

  const activeAgents = Array.from(agentLatest.values()).sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  return (
    <div style={{ padding: "4px 12px" }}>
      {activeAgents.map((entry) => {
        const cost = costByAgent.get(entry.agent);
        return (
          <div
            key={entry.agent}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 8px",
              fontSize: "13px",
            }}
          >
            {/* Pulsing green dot */}
            <span
              className="live-pulse-dot"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#4ade80",
                flexShrink: 0,
              }}
            />
            <AgentLogo agent={entry.agent} />
            <span style={{ color: "#d4d4d8", flexShrink: 0 }}>
              {agentDisplayName(entry.agent)}
            </span>
            {entry.filePath && (
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  color: "#a1a1aa",
                  fontSize: "12px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {truncatePath(entry.filePath)}
              </span>
            )}
            {cost != null && cost > 0 && (
              <span style={{ color: "#71717a", fontSize: "12px", flexShrink: 0 }}>
                {formatCost(cost)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
