import type { HostKind, SessionGroup } from "../types";
import { HOST_KINDS } from "../types";

export interface HostPartition {
  kind: HostKind;
  items: SessionGroup[];
}

export interface PartitionResult {
  /** Host groups with at least one session, sorted by session count desc, then sessions by endTime desc. */
  groups: HostPartition[];
  /** Known host kinds with zero sessions (excludes "unknown"). Shown dimmed in the UI footer. */
  idleHosts: HostKind[];
  /** Number of sessions where `isLive` is true. */
  totalLive: number;
}

/**
 * Partition a flat list of sessions by host kind. Used by the left rail to
 * build host-grouped session lists plus the "idle hosts" footer.
 */
export function partitionSessionsByHost(sessions: SessionGroup[]): PartitionResult {
  const byHost = new Map<HostKind, SessionGroup[]>();
  for (const s of sessions) {
    const kind = s.hostKind;
    if (!byHost.has(kind)) byHost.set(kind, []);
    byHost.get(kind)!.push(s);
  }
  const seenKinds = new Set(byHost.keys());
  const groups: HostPartition[] = Array.from(byHost.entries())
    .map(([kind, items]) => ({
      kind,
      items: [...items].sort((a, b) => b.endTime.localeCompare(a.endTime)),
    }))
    .sort((a, b) => b.items.length - a.items.length);

  const idleHosts = HOST_KINDS.filter((k) => !seenKinds.has(k) && k !== "unknown");
  const totalLive = sessions.filter((s) => s.isLive).length;

  return { groups, idleHosts, totalLive };
}
