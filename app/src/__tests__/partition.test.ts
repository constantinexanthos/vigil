import { describe, it, expect } from "vitest";
import { partitionSessionsByHost } from "../lib/partition";
import type { HostKind, SessionGroup } from "../types";

function makeSession(overrides: Partial<SessionGroup> = {}): SessionGroup {
  return {
    id: overrides.id ?? "s-1",
    agent: overrides.agent ?? "claude-code",
    repoPath: overrides.repoPath ?? "/tmp/project",
    startTime: overrides.startTime ?? "2026-04-16T10:00:00Z",
    endTime: overrides.endTime ?? "2026-04-16T10:05:00Z",
    description: overrides.description ?? "doing things",
    files: overrides.files ?? [],
    confidence: overrides.confidence ?? 80,
    costUsd: overrides.costUsd ?? 0,
    hasWarning: overrides.hasWarning ?? false,
    hostKind: overrides.hostKind ?? "unknown",
    hostPid: overrides.hostPid ?? null,
    model: overrides.model ?? null,
    isLive: overrides.isLive ?? false,
    summaryPlainEnglish: overrides.summaryPlainEnglish ?? null,
    summaryGeneratedAt: overrides.summaryGeneratedAt ?? null,
  };
}

describe("partitionSessionsByHost", () => {
  it("returns empty groups + all known idle hosts when there are no sessions", () => {
    const result = partitionSessionsByHost([]);
    expect(result.groups).toEqual([]);
    expect(result.totalLive).toBe(0);
    // Every known kind except "unknown" should be marked idle.
    const expectedIdle: HostKind[] = [
      "ghostty", "iterm2", "terminal", "warp", "kitty", "alacritty",
      "conductor", "cursor", "vscode", "zed", "windsurf",
    ];
    expect(result.idleHosts).toEqual(expectedIdle);
  });

  it("groups sessions by host kind", () => {
    const sessions = [
      makeSession({ id: "a", hostKind: "ghostty" }),
      makeSession({ id: "b", hostKind: "conductor" }),
      makeSession({ id: "c", hostKind: "ghostty" }),
    ];
    const { groups } = partitionSessionsByHost(sessions);
    expect(groups).toHaveLength(2);
    const ghostty = groups.find((g) => g.kind === "ghostty");
    const conductor = groups.find((g) => g.kind === "conductor");
    expect(ghostty?.items).toHaveLength(2);
    expect(conductor?.items).toHaveLength(1);
  });

  it("sorts groups by session count descending", () => {
    const sessions = [
      makeSession({ id: "a", hostKind: "conductor" }),
      makeSession({ id: "b", hostKind: "ghostty" }),
      makeSession({ id: "c", hostKind: "ghostty" }),
      makeSession({ id: "d", hostKind: "ghostty" }),
    ];
    const { groups } = partitionSessionsByHost(sessions);
    expect(groups[0]?.kind).toBe("ghostty"); // 3 sessions wins
    expect(groups[1]?.kind).toBe("conductor"); // 1 session
  });

  it("sorts sessions within a group by endTime descending (newest first)", () => {
    const sessions = [
      makeSession({ id: "old", hostKind: "ghostty", endTime: "2026-04-16T09:00:00Z" }),
      makeSession({ id: "new", hostKind: "ghostty", endTime: "2026-04-16T11:00:00Z" }),
      makeSession({ id: "mid", hostKind: "ghostty", endTime: "2026-04-16T10:00:00Z" }),
    ];
    const { groups } = partitionSessionsByHost(sessions);
    const items = groups[0]!.items.map((s) => s.id);
    expect(items).toEqual(["new", "mid", "old"]);
  });

  it("excludes hostKinds that have sessions from the idle list", () => {
    const sessions = [
      makeSession({ id: "a", hostKind: "ghostty" }),
      makeSession({ id: "b", hostKind: "cursor" }),
    ];
    const { idleHosts } = partitionSessionsByHost(sessions);
    expect(idleHosts).not.toContain("ghostty");
    expect(idleHosts).not.toContain("cursor");
    expect(idleHosts).toContain("conductor");
  });

  it("always excludes 'unknown' from idle hosts", () => {
    const { idleHosts } = partitionSessionsByHost([]);
    expect(idleHosts).not.toContain("unknown");
  });

  it("does not mutate the input array", () => {
    const sessions = [
      makeSession({ id: "a", hostKind: "ghostty", endTime: "2026-04-16T10:00:00Z" }),
      makeSession({ id: "b", hostKind: "ghostty", endTime: "2026-04-16T11:00:00Z" }),
    ];
    const before = sessions.map((s) => s.id);
    partitionSessionsByHost(sessions);
    const after = sessions.map((s) => s.id);
    expect(after).toEqual(before);
  });

  it("counts live sessions across all hosts", () => {
    const sessions = [
      makeSession({ id: "a", hostKind: "ghostty", isLive: true }),
      makeSession({ id: "b", hostKind: "conductor", isLive: true }),
      makeSession({ id: "c", hostKind: "ghostty", isLive: false }),
    ];
    const { totalLive } = partitionSessionsByHost(sessions);
    expect(totalLive).toBe(2);
  });

  it("groups 'unknown' kind into its own bucket if sessions have it", () => {
    const sessions = [
      makeSession({ id: "a", hostKind: "unknown" }),
    ];
    const { groups, idleHosts } = partitionSessionsByHost(sessions);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("unknown");
    // "unknown" still isn't in idle hosts even when present in groups
    expect(idleHosts).not.toContain("unknown");
  });
});
