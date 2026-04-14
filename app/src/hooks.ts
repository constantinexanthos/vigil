import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AgentEvent,
  Collision,
  AgentStat,
  ConfidenceScore,
  StreamPayload,
} from "./types";

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
  confidenceScores: ConfidenceScore[];
  eventCount: number;
  connected: boolean;
  error: string | null;
  agentActivity: Map<string, AgentActivity>;
  newEventIds: Set<number>;
}

const POLL_INTERVAL = 5000; // Slower fallback since streaming handles real-time.
const SPARKLINE_WINDOW = 30;
const MAX_EVENTS = 200;

export function useDaemonData(): DaemonState {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStat[]>([]);
  const [confidenceScores, setConfidenceScores] = useState<ConfidenceScore[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentActivity, setAgentActivity] = useState<Map<string, AgentActivity>>(new Map());
  const [newEventIds, setNewEventIds] = useState<Set<number>>(new Set());

  const prevEventCountByAgent = useRef<Map<string, number>>(new Map());
  const sparklineBuffers = useRef<Map<string, number[]>>(new Map());
  const prevEventIds = useRef<Set<number>>(new Set());
  const streamActive = useRef(false);

  // Compute sparklines and activity from a stats array + events array.
  const computeActivity = useCallback(
    (stats: AgentStat[], evts: AgentEvent[]) => {
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

      return nextActivity;
    },
    [],
  );

  // Compute new event IDs for entrance animations.
  const computeNewIds = useCallback((evts: AgentEvent[]) => {
    const currentIds = new Set(evts.map((e) => e.id));
    const freshIds = new Set<number>();
    for (const id of currentIds) {
      if (!prevEventIds.current.has(id)) {
        freshIds.add(id);
      }
    }
    prevEventIds.current = currentIds;
    return freshIds;
  }, []);

  // Full fetch — used on initial load and as fallback.
  const fetchAll = useCallback(async () => {
    try {
      const [evts, agents, cols, stats, scores, count] = await Promise.all([
        invoke<AgentEvent[]>("get_recent_events", { limit: 50 }),
        invoke<string[]>("get_active_agents"),
        invoke<Collision[]>("get_collisions"),
        invoke<AgentStat[]>("get_agent_stats"),
        invoke<ConfidenceScore[]>("get_confidence_scores"),
        invoke<number>("get_event_count"),
      ]);

      const freshIds = computeNewIds(evts);
      if (freshIds.size > 0) {
        setNewEventIds(freshIds);
        setTimeout(() => setNewEventIds(new Set()), 400);
      }

      setEvents(evts);
      setActiveAgents(agents);
      setCollisions(cols);
      setAgentStats(stats);
      setConfidenceScores(scores);
      setEventCount(count);
      setConnected(true);
      setError(null);
      setAgentActivity(computeActivity(stats, evts));
    } catch (e) {
      setConnected(false);
      setError(
        e instanceof Error ? e.message : "Daemon not running. Start with: vigil watch <dir>",
      );
    }
  }, [computeActivity, computeNewIds]);

  // Listen for real-time stream events from the Tauri backend.
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<StreamPayload>("vigil://stream", (event) => {
      streamActive.current = true;
      const payload = event.payload;

      setEvents((prev) => {
        const combined = [...payload.events.reverse(), ...prev];
        return combined.slice(0, MAX_EVENTS);
      });

      // Mark new events for animations.
      const freshIds = new Set(payload.events.map((e) => e.id));
      if (freshIds.size > 0) {
        setNewEventIds(freshIds);
        setTimeout(() => setNewEventIds(new Set()), 400);
      }

      setActiveAgents(payload.active_agents);
      setCollisions(payload.collisions);
      setConfidenceScores(payload.scores);
      setEventCount(payload.event_count);
      setConnected(true);
      setError(null);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // Initial fetch + fallback polling.
  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      if (!streamActive.current) {
        fetchAll();
      }
      streamActive.current = false;
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    events,
    activeAgents,
    collisions,
    agentStats,
    confidenceScores,
    eventCount,
    connected,
    error,
    agentActivity,
    newEventIds,
  };
}
