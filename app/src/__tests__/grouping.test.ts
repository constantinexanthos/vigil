import { describe, it, expect } from "vitest";
import {
  groupEventsIntoSessions,
  enrichSessionsWithLiveData,
} from "../types";
import type {
  AgentEvent,
  CommitGroup,
  CostSummary,
  LiveSessionRow,
  ProjectGroup,
} from "../types";

const emptyCost: CostSummary = { total_cost_usd: 0, agents: [] };

function evt(
  partial: Partial<AgentEvent> & { timestamp: string; agent: string },
): AgentEvent {
  return {
    id: partial.id ?? 0,
    timestamp: partial.timestamp,
    kind: partial.kind ?? "file_modify",
    file_path: partial.file_path ?? null,
    agent: partial.agent,
    diff: partial.diff ?? null,
  };
}

describe("groupEventsIntoSessions", () => {
  it("returns empty array for empty events", () => {
    expect(groupEventsIntoSessions([], [], emptyCost)).toEqual([]);
  });

  it("collapses consecutive events into one session", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      evt({ timestamp: "2026-04-16T10:01:00Z", agent: "claude-code", file_path: "/repo/b.ts" }),
      evt({ timestamp: "2026-04-16T10:02:00Z", agent: "claude-code", file_path: "/repo/c.ts" }),
    ];
    const projects = groupEventsIntoSessions(events, [], emptyCost);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.sessions).toHaveLength(1);
    expect(projects[0]!.sessions[0]!.files).toHaveLength(3);
  });

  it("splits sessions when the gap is > 5 minutes", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      // 10-minute gap → new session
      evt({ timestamp: "2026-04-16T10:10:00Z", agent: "claude-code", file_path: "/repo/b.ts" }),
    ];
    const projects = groupEventsIntoSessions(events, [], emptyCost);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.sessions).toHaveLength(2);
  });

  it("keeps sessions together at exactly the 5-minute boundary", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      // Exactly 5 minutes — threshold is strict greater-than, so same session
      evt({ timestamp: "2026-04-16T10:05:00Z", agent: "claude-code", file_path: "/repo/b.ts" }),
    ];
    const projects = groupEventsIntoSessions(events, [], emptyCost);
    expect(projects[0]!.sessions).toHaveLength(1);
  });

  it("separates sessions across different agents", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      evt({ timestamp: "2026-04-16T10:00:30Z", agent: "cursor", file_path: "/repo/b.ts" }),
    ];
    const projects = groupEventsIntoSessions(events, [], emptyCost);
    expect(projects[0]!.sessions).toHaveLength(2);
    const agents = projects[0]!.sessions.map((s) => s.agent).sort();
    expect(agents).toEqual(["claude-code", "cursor"]);
  });

  it("assigns confidence 85 for sessions with <=3 files and no commit match", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      evt({ timestamp: "2026-04-16T10:01:00Z", agent: "claude-code", file_path: "/repo/b.ts" }),
    ];
    const projects = groupEventsIntoSessions(events, [], emptyCost);
    expect(projects[0]!.sessions[0]!.confidence).toBe(85);
  });

  it("downgrades confidence as file count grows (heuristic)", () => {
    const paths = Array.from({ length: 12 }, (_, i) => `/repo/f${i}.ts`);
    const events: AgentEvent[] = paths.map((p, i) =>
      evt({
        timestamp: new Date(Date.UTC(2026, 3, 16, 10, 0, i * 10)).toISOString(),
        agent: "claude-code",
        file_path: p,
      }),
    );
    const projects = groupEventsIntoSessions(events, [], emptyCost);
    // 12 files → confidence 55 per heuristic (9..15)
    expect(projects[0]!.sessions[0]!.confidence).toBe(55);
  });

  it("uses commit message + confidence from matching CommitGroup", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      evt({ timestamp: "2026-04-16T10:01:00Z", agent: "claude-code", file_path: "/repo/b.ts" }),
    ];
    const commit: CommitGroup = {
      commit_hash: "abc123",
      commit_message: "feat: tighten auth flow\n\nlonger body",
      agent: "claude-code",
      timestamp: "2026-04-16T10:01:30Z",
      files: [],
      confidence_score: 60,
      cost_usd: 0,
    };
    const projects = groupEventsIntoSessions(events, [commit], emptyCost);
    const session = projects[0]!.sessions[0]!;
    expect(session.description.toLowerCase()).toContain("tighten auth flow");
    expect(session.confidence).toBe(60);
    expect(session.hasWarning).toBe(true); // <75 triggers warning
  });

  it("apportions cost across an agent's sessions", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
      evt({ timestamp: "2026-04-16T10:10:00Z", agent: "claude-code", file_path: "/repo/b.ts" }),
    ];
    const cost: CostSummary = {
      total_cost_usd: 2.0,
      agents: [
        {
          agent: "claude-code",
          total_cost_usd: 2.0,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          event_count: 2,
        },
      ],
    };
    const projects = groupEventsIntoSessions(events, [], cost);
    // Two sessions for the same agent — cost split evenly
    const sessions = projects[0]!.sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.costUsd).toBeCloseTo(1.0);
    expect(sessions[1]!.costUsd).toBeCloseTo(1.0);
  });

  it("initializes new-feature fields with safe defaults", () => {
    const events: AgentEvent[] = [
      evt({ timestamp: "2026-04-16T10:00:00Z", agent: "claude-code", file_path: "/repo/a.ts" }),
    ];
    const session = groupEventsIntoSessions(events, [], emptyCost)[0]!.sessions[0]!;
    expect(session.hostKind).toBe("unknown");
    expect(session.hostPid).toBeNull();
    expect(session.model).toBeNull();
    expect(session.isLive).toBe(false);
    expect(session.summaryPlainEnglish).toBeNull();
    expect(session.summaryGeneratedAt).toBeNull();
  });
});

/**
 * Build a minimal ProjectGroup with one session, keyed to a specific
 * start/end/agent/repo for enrichment tests.
 */
function oneSessionProject(opts: {
  id?: string;
  agent: string;
  repoPath: string;
  startTime: string;
  endTime: string;
}): ProjectGroup {
  return {
    project: "demo",
    repoPath: opts.repoPath,
    agents: [opts.agent],
    sessions: [
      {
        id: opts.id ?? `${opts.agent}-0-${opts.startTime}`,
        agent: opts.agent,
        repoPath: opts.repoPath,
        startTime: opts.startTime,
        endTime: opts.endTime,
        description: "",
        files: [],
        confidence: 80,
        costUsd: 0,
        hasWarning: false,
        hostKind: "unknown",
        hostPid: null,
        model: null,
        isLive: false,
        summaryPlainEnglish: null,
        summaryGeneratedAt: null,
      },
    ],
  };
}

function liveRow(partial: Partial<LiveSessionRow> & { session_id: string }): LiveSessionRow {
  return {
    session_id: partial.session_id,
    host_kind: partial.host_kind ?? "unknown",
    agent: partial.agent ?? "claude-code",
    repo_path: partial.repo_path ?? null,
    started_at: partial.started_at ?? "2026-04-16T10:00:00Z",
    ended_at: partial.ended_at ?? "2026-04-16T10:05:00Z",
    model: partial.model ?? null,
    is_live: partial.is_live ?? false,
    description: partial.description ?? "",
    files_added: partial.files_added,
    files_removed: partial.files_removed,
    cost_usd: partial.cost_usd,
    confidence: partial.confidence,
  };
}

describe("enrichSessionsWithLiveData", () => {
  it("returns projects unchanged when liveSessions is empty", () => {
    const projects = [oneSessionProject({
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:05:00Z",
    })];
    expect(enrichSessionsWithLiveData(projects, [])).toBe(projects);
  });

  it("fast-path matches by direct session_id", () => {
    const projects = [oneSessionProject({
      id: "exact-id",
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:05:00Z",
    })];
    const enriched = enrichSessionsWithLiveData(projects, [
      liveRow({
        session_id: "exact-id",
        host_kind: "conductor",
        model: "claude-opus-4-7",
        is_live: true,
        description: "plain english summary",
      }),
    ]);
    const session = enriched[0]!.sessions[0]!;
    expect(session.hostKind).toBe("conductor");
    expect(session.model).toBe("claude-opus-4-7");
    expect(session.isLive).toBe(true);
    expect(session.summaryPlainEnglish).toBe("plain english summary");
  });

  it("fallback matches by agent + repo_path + time overlap", () => {
    const projects = [oneSessionProject({
      id: "synthetic-id-won't-match",
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:10:00Z",
    })];
    const enriched = enrichSessionsWithLiveData(projects, [
      liveRow({
        session_id: "real-uuid-different",
        agent: "claude-code",
        repo_path: "/repo",
        started_at: "2026-04-16T10:05:00Z",
        ended_at: "2026-04-16T10:15:00Z",
        host_kind: "ghostty",
        is_live: true,
      }),
    ]);
    const session = enriched[0]!.sessions[0]!;
    expect(session.hostKind).toBe("ghostty");
    expect(session.isLive).toBe(true);
  });

  it("leaves a session untouched when no row overlaps", () => {
    const projects = [oneSessionProject({
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:05:00Z",
    })];
    const enriched = enrichSessionsWithLiveData(projects, [
      liveRow({
        session_id: "nope",
        agent: "claude-code",
        repo_path: "/repo",
        // Completely disjoint time range
        started_at: "2026-04-16T11:00:00Z",
        ended_at: "2026-04-16T11:05:00Z",
        host_kind: "ghostty",
      }),
    ]);
    expect(enriched[0]!.sessions[0]!.hostKind).toBe("unknown");
  });

  it("does not match across different agents", () => {
    const projects = [oneSessionProject({
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:05:00Z",
    })];
    const enriched = enrichSessionsWithLiveData(projects, [
      liveRow({
        session_id: "r1",
        agent: "cursor",
        repo_path: "/repo",
        started_at: "2026-04-16T10:01:00Z",
        ended_at: "2026-04-16T10:04:00Z",
        host_kind: "cursor",
      }),
    ]);
    expect(enriched[0]!.sessions[0]!.hostKind).toBe("unknown");
  });

  it("does not match when repo_path is specified and differs", () => {
    const projects = [oneSessionProject({
      agent: "claude-code",
      repoPath: "/repo-A",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:05:00Z",
    })];
    const enriched = enrichSessionsWithLiveData(projects, [
      liveRow({
        session_id: "r1",
        agent: "claude-code",
        repo_path: "/repo-B",
        started_at: "2026-04-16T10:01:00Z",
        ended_at: "2026-04-16T10:04:00Z",
        host_kind: "ghostty",
      }),
    ]);
    expect(enriched[0]!.sessions[0]!.hostKind).toBe("unknown");
  });

  it("picks the best (largest) overlap when multiple rows match", () => {
    const projects = [oneSessionProject({
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:10:00Z",
    })];
    const enriched = enrichSessionsWithLiveData(projects, [
      // 1-minute overlap
      liveRow({
        session_id: "small",
        agent: "claude-code",
        repo_path: "/repo",
        started_at: "2026-04-16T10:09:00Z",
        ended_at: "2026-04-16T10:11:00Z",
        host_kind: "ghostty",
      }),
      // 5-minute overlap
      liveRow({
        session_id: "big",
        agent: "claude-code",
        repo_path: "/repo",
        started_at: "2026-04-16T10:05:00Z",
        ended_at: "2026-04-16T10:15:00Z",
        host_kind: "conductor",
      }),
    ]);
    expect(enriched[0]!.sessions[0]!.hostKind).toBe("conductor");
  });

  it("does not mutate the input projects array", () => {
    const projects = [oneSessionProject({
      agent: "claude-code",
      repoPath: "/repo",
      startTime: "2026-04-16T10:00:00Z",
      endTime: "2026-04-16T10:05:00Z",
    })];
    const originalHostKind = projects[0]!.sessions[0]!.hostKind;
    enrichSessionsWithLiveData(projects, [
      liveRow({
        session_id: "whatever",
        agent: "claude-code",
        repo_path: "/repo",
        started_at: "2026-04-16T10:01:00Z",
        ended_at: "2026-04-16T10:04:00Z",
        host_kind: "ghostty",
      }),
    ]);
    // Input must be unchanged — enrichment returns a new structure
    expect(projects[0]!.sessions[0]!.hostKind).toBe(originalHostKind);
  });
});
