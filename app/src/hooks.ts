import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgentEvent, Collision, AgentStat } from "./types";

interface DaemonState {
  events: AgentEvent[];
  collisions: Collision[];
  agentStats: AgentStat[];
  eventCount: number;
  connected: boolean;
  error: string | null;
}

const POLL_INTERVAL = 2000;

export function useDaemonData(): DaemonState {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStat[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [evts, cols, stats, count] = await Promise.all([
        invoke<AgentEvent[]>("get_recent_events", { limit: 50 }),
        invoke<Collision[]>("get_collisions"),
        invoke<AgentStat[]>("get_agent_stats"),
        invoke<number>("get_event_count"),
      ]);
      setEvents(evts);
      setCollisions(cols);
      setAgentStats(stats);
      setEventCount(count);
      setConnected(true);
      setError(null);
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

  return { events, collisions, agentStats, eventCount, connected, error };
}
