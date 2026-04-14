import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgentEvent, Collision, AgentStat, CostSummary } from "./types";

export interface AgentActivity {
  agent: string;
  sparkline: number[];
  lastFile: string | null;
  lastEventTime: number;
}

interface DaemonState {
  events: AgentEvent[];
  activeAgents: string[];
  collisions: Collision[];
  agentStats: AgentStat[];
  eventCount: number;
  costSummary: CostSummary;
  connected: boolean;
  error: string | null;
  agentActivity: Map<string, AgentActivity>;
  newEventIds: Set<number>;
}

const POLL_INTERVAL = 2000;
const SPARKLINE_WINDOW = 30;

export function useDaemonData(): DaemonState {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStat[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentActivity, setAgentActivity] = useState<Map<string, AgentActivity>>(new Map());
  const [newEventIds, setNewEventIds] = useState<Set<number>>(new Set());
  const [costSummary, setCostSummary] = useState<CostSummary>({ total_cost_usd: 0, agents: [] });

  const prevEventCountByAgent = useRef<Map<string, number>>(new Map());
  const sparklineBuffers = useRef<Map<string, number[]>>(new Map());
  const prevEventIds = useRef<Set<number>>(new Set());

  const fetchAll = useCallback(async () => {
    try {
      const [evts, agents, cols, stats, count, cost] = await Promise.all([
        invoke<AgentEvent[]>("get_recent_events", { limit: 50 }),
        invoke<string[]>("get_active_agents"),
        invoke<Collision[]>("get_collisions"),
        invoke<AgentStat[]>("get_agent_stats"),
        invoke<number>("get_event_count"),
        invoke<CostSummary>("get_cost_summary", { hours: 24 }).catch(() => ({ total_cost_usd: 0, agents: [] })),
      ]);

      // Compute new event IDs for entrance animations
      const currentIds = new Set(evts.map((e) => e.id));
      const freshIds = new Set<number>();
      for (const id of currentIds) {
        if (!prevEventIds.current.has(id)) {
          freshIds.add(id);
        }
      }
      prevEventIds.current = currentIds;

      if (freshIds.size > 0) {
        setNewEventIds(freshIds);
        setTimeout(() => setNewEventIds(new Set()), 400);
      }

      // Compute sparkline deltas per agent
      const now = Date.now();
      const nextActivity = new Map<string, AgentActivity>();

      for (const stat of stats) {
        const prevCount = prevEventCountByAgent.current.get(stat.agent) ?? stat.count;
        const delta = Math.max(0, stat.count - prevCount);
        prevEventCountByAgent.current.set(stat.agent, stat.count);

        let buffer = sparklineBuffers.current.get(stat.agent);
        if (!buffer) {
          buffer = new Array(SPARKLINE_WINDOW).fill(0);
          sparklineBuffers.current.set(stat.agent, buffer);
        }

        buffer.push(delta);
        if (buffer.length > SPARKLINE_WINDOW) {
          buffer.splice(0, buffer.length - SPARKLINE_WINDOW);
        }

        // Find last file for this agent
        const agentEvents = evts.filter((e) => e.agent === stat.agent);
        const lastFileEvent = agentEvents.find((e) => e.file_path);
        const lastEventTimeForAgent = agentEvents[0]
          ? new Date(agentEvents[0].timestamp).getTime()
          : 0;

        nextActivity.set(stat.agent, {
          agent: stat.agent,
          sparkline: [...buffer],
          lastFile: lastFileEvent?.file_path ?? null,
          lastEventTime: lastEventTimeForAgent || now,
        });
      }

      setEvents(evts);
      setActiveAgents(agents);
      setCollisions(cols);
      setAgentStats(stats);
      setEventCount(count);
      setCostSummary(cost);
      setConnected(true);
      setError(null);
      setAgentActivity(nextActivity);
    } catch (e) {
      setConnected(false);
      setError(
        e instanceof Error ? e.message : "Daemon not running. Start with: vigil watch <dir>",
      );
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    events,
    activeAgents,
    collisions,
    agentStats,
    eventCount,
    costSummary,
    connected,
    error,
    agentActivity,
    newEventIds,
  };
}
