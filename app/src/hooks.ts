import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AgentEvent,
  Collision,
  AgentStat,
  CostSummary,
  CommitGroup,
  WorkspaceSummary,
  HostInfo,
  LiveSessionRow,
  CliStatus,
  SessionTurn,
  ReviewSignals,
} from "./types";
import { DEMO_EVENTS, DEMO_COMMIT_GROUPS, DEMO_COST_SUMMARY, DEMO_COLLISIONS } from "./demo-data";
import { useSelection } from "./store/selection";

export interface ServerSummary {
  text: string;
  generated_at: string;
  backend: string;
  stale_seconds: number;
}

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
  hasNewEvents: boolean;
  commitGroups: CommitGroup[];
  workspaceSummary: WorkspaceSummary;
  lastUpdated: number;
  demoMode: boolean;
  hosts: HostInfo[];
  liveSessions: LiveSessionRow[];
  cli: CliStatus;
  /** Summary for the currently selected session (from the selection store). `null` when no selection or no summary cached yet. */
  currentSummary: ServerSummary | null;
  /** Recent session turns for the currently-selected session (16 newest, ascending by insertion). */
  recentTurns: SessionTurn[];
  /** Review signals for the currently-selected session. Null when no session or fetch failed. */
  reviewSignals: ReviewSignals | null;
}

const DEFAULT_CLI: CliStatus = { claude: false, codex: false };

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
  const [hasNewEvents, setHasNewEvents] = useState(false);
  const [costSummary, setCostSummary] = useState<CostSummary>({ total_cost_usd: 0, agents: [] });
  const [commitGroups, setCommitGroups] = useState<CommitGroup[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [workspaceSummary, setWorkspaceSummary] = useState<WorkspaceSummary>({ commits_today: 0, files_changed_today: 0, total_cost_today: 0, agent_commits: [], active_collisions: [] });
  const [demoMode, setDemoMode] = useState(false);
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSessionRow[]>([]);
  const [cli, setCli] = useState<CliStatus>(DEFAULT_CLI);
  const [currentSummary, setCurrentSummary] = useState<ServerSummary | null>(null);
  const [recentTurns, setRecentTurns] = useState<SessionTurn[]>([]);
  const [reviewSignals, setReviewSignals] = useState<ReviewSignals | null>(null);
  // Read selection from the store without subscribing to re-renders on every change —
  // fetchAll re-reads via getState on each tick.
  const selectedSessionIdRef = useRef<string | null>(useSelection.getState().selectedSessionId);
  useEffect(() => {
    return useSelection.subscribe((s) => {
      selectedSessionIdRef.current = s.selectedSessionId;
    });
  }, []);
  const hasEverConnected = useRef(false);

  const prevEventCountByAgent = useRef<Map<string, number>>(new Map());
  const sparklineBuffers = useRef<Map<string, number[]>>(new Map());
  const prevEventIds = useRef<Set<number>>(new Set());

  const fetchAll = useCallback(async () => {
    try {
      const activeSessionId = selectedSessionIdRef.current;
      const [evts, agents, cols, stats, count, cost, commits, summary, hostRows, liveRows, cliStatus, sessionSummary, turnsResult, reviewResult] = await Promise.all([
        invoke<AgentEvent[]>("get_recent_events", { limit: 50 }),
        invoke<string[]>("get_active_agents"),
        invoke<Collision[]>("get_collisions"),
        invoke<AgentStat[]>("get_agent_stats"),
        invoke<number>("get_event_count"),
        invoke<CostSummary>("get_cost_summary", { hours: 24 }).catch(() => ({ total_cost_usd: 0, agents: [] })),
        invoke<CommitGroup[]>("get_commit_activity", { hours: 24 }).catch(() => [] as CommitGroup[]),
        invoke<WorkspaceSummary>("get_workspace_summary").catch(() => ({ commits_today: 0, files_changed_today: 0, total_cost_today: 0, agent_commits: [], active_collisions: [] } as WorkspaceSummary)),
        invoke<HostInfo[]>("get_hosts").catch(() => [] as HostInfo[]),
        invoke<LiveSessionRow[]>("get_live_sessions").catch(() => [] as LiveSessionRow[]),
        invoke<CliStatus>("detect_cli").catch(() => ({ ...DEFAULT_CLI })),
        activeSessionId
          ? invoke<ServerSummary | null>("get_summary", { sessionId: activeSessionId }).catch(() => null)
          : Promise.resolve(null),
        activeSessionId
          ? invoke<SessionTurn[]>("get_recent_turns", { sessionId: activeSessionId, limit: 16 }).catch(() => [] as SessionTurn[])
          : Promise.resolve([] as SessionTurn[]),
        activeSessionId
          ? invoke<ReviewSignals | null>("get_review_signals", { sessionId: activeSessionId }).catch(() => null)
          : Promise.resolve(null),
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
        setHasNewEvents(true);
        setTimeout(() => {
          setNewEventIds(new Set());
          setHasNewEvents(false);
        }, 400);
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
      setCommitGroups(commits);
      setWorkspaceSummary(summary);
      setHosts(hostRows);
      setLiveSessions(liveRows);
      setCli(cliStatus);
      setCurrentSummary(sessionSummary);
      setRecentTurns(turnsResult);
      setReviewSignals(reviewResult);
      setLastUpdated(Date.now());
      setConnected(true);
      setError(null);
      setAgentActivity(nextActivity);
      hasEverConnected.current = true;
      if (demoMode) setDemoMode(false);
    } catch (e) {
      setConnected(false);
      setError(
        e instanceof Error ? e.message : "Daemon not running. Start with: vigil watch <dir>",
      );
      // Load demo data if never connected and demo not dismissed
      if (!hasEverConnected.current && !demoMode) {
        const dismissed = localStorage.getItem("vigil-demo-dismissed");
        if (dismissed !== "true") {
          setDemoMode(true);
          setEvents(DEMO_EVENTS);
          setCollisions(DEMO_COLLISIONS);
          setCostSummary(DEMO_COST_SUMMARY);
          setCommitGroups(DEMO_COMMIT_GROUPS);
          setEventCount(DEMO_EVENTS.length);
          setHosts([]);
          setLiveSessions([]);
          setCli({ ...DEFAULT_CLI });
          setCurrentSummary(null);
          setRecentTurns([]);
          setReviewSignals(null);
          setLastUpdated(Date.now());
        }
      }
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
    hasNewEvents,
    commitGroups,
    workspaceSummary,
    lastUpdated,
    demoMode,
    hosts,
    liveSessions,
    cli,
    currentSummary,
    recentTurns,
    reviewSignals,
  };
}
