export type HostKind =
  | "ghostty"
  | "iterm2"
  | "terminal"
  | "warp"
  | "kitty"
  | "alacritty"
  | "conductor"
  | "cursor"
  | "vscode"
  | "zed"
  | "windsurf"
  | "unknown";

export const HOST_KINDS: HostKind[] = [
  "ghostty",
  "iterm2",
  "terminal",
  "warp",
  "kitty",
  "alacritty",
  "conductor",
  "cursor",
  "vscode",
  "zed",
  "windsurf",
  "unknown",
];

export function isHostKind(v: string): v is HostKind {
  return (HOST_KINDS as string[]).includes(v);
}

export interface AgentEvent {
  id: number;
  timestamp: string;
  kind: string;
  file_path: string | null;
  agent: string;
  diff: string | null;
}

export interface HostInfo {
  kind: HostKind;
  active_sessions: number;
}

export interface LiveSessionRow {
  session_id: string;
  host_kind: HostKind;
  agent: string;
  repo_path: string | null;
  started_at: string;
  ended_at: string;
  model: string | null;
  is_live: boolean;
  description: string;
  files_added?: number;
  files_removed?: number;
  cost_usd?: number;
  confidence?: number;
}

export interface SessionTurn {
  session_id: string;
  timestamp: string;
  role: string;
  text: string;
  tool_names: string[];
  source: string;
}

export interface ReviewSignals {
  confidence: number;
  confidence_reason: string;
  file_count: number;
  has_tests: boolean;
  collisions: Array<{
    file_path: string;
    agents: string[];
  }>;
}

export interface CliStatus {
  claude: boolean;
  codex: boolean;
}

export interface Collision {
  file_path: string;
  agents: string[];
}

export interface AgentStat {
  agent: string;
  count: number;
}

export const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#00ff41",
  cursor: "#00d9ff",
  conductor: "#a78bfa",
  aider: "#ffb800",
  codex: "#f472b6",
  cline: "#34d399",
};

export function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? "#6b7084";
}

const DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  conductor: "Conductor",
  aider: "Aider",
  codex: "Codex",
  cline: "Cline",
  chatgpt: "ChatGPT",
};

export function agentDisplayName(agent: string): string {
  return DISPLAY_NAMES[agent] ?? agent;
}

interface KindIconResult {
  symbol: string;
  color: string;
}

const KIND_ICONS: Record<string, KindIconResult> = {
  file_write: { symbol: "W", color: "#00ff41" },
  file_create: { symbol: "+", color: "#34d399" },
  file_delete: { symbol: "x", color: "#ff3333" },
  file_rename: { symbol: "~", color: "#ffb800" },
  file_modify: { symbol: "M", color: "#00d9ff" },
  checkpoint: { symbol: "C", color: "#a78bfa" },
};

export function kindIcon(kind: string): KindIconResult {
  return KIND_ICONS[kind] ?? { symbol: ".", color: "#6b7084" };
}

export function truncatePath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

export function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export interface CostAgentSummary {
  agent: string;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  event_count: number;
}

export interface CostSummary {
  total_cost_usd: number;
  agents: CostAgentSummary[];
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export interface FileChange {
  path: string;
  kind: string;
  added: number;
  removed: number;
}

export interface CommitGroup {
  commit_hash: string;
  commit_message: string;
  agent: string;
  timestamp: string;
  files: FileChange[];
  confidence_score: number;
  cost_usd: number;
}

export interface AgentCommitCount {
  agent: string;
  commit_count: number;
}

export interface WorkspaceSummary {
  commits_today: number;
  files_changed_today: number;
  total_cost_today: number;
  agent_commits: AgentCommitCount[];
  active_collisions: Collision[];
}

export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function confidenceColor(score: number): string {
  if (score >= 75) return "#4ade80";
  if (score >= 50) return "#fbbf24";
  return "#ef4444";
}

// --- Session Feed Types ---

export interface SessionFile {
  path: string;
  kind: string;
  diff: string | null;
  added: number;
  removed: number;
}

export interface SessionGroup {
  id: string;
  agent: string;
  repoPath: string;
  startTime: string;
  endTime: string;
  description: string;
  files: SessionFile[];
  confidence: number;
  costUsd: number;
  hasWarning: boolean;
  // NEW below:
  hostKind: HostKind;
  hostPid: number | null;
  model: string | null;
  isLive: boolean;
  summaryPlainEnglish: string | null;
  summaryGeneratedAt: string | null;
}

export interface ProjectGroup {
  project: string;
  repoPath: string;
  agents: string[];
  sessions: SessionGroup[];
}

export interface AgentGroup {
  agent: string;
  displayName: string;
  isActive: boolean;
  sessions: SessionGroup[];
  totalCost: number;
}

/** Extract just the commit message from a git show/log output or raw commit string */
function extractCommitMessage(raw: string): string {
  // If it starts with a hash, it's "hash message" format from the daemon
  const hashMsgMatch = raw.match(/^[0-9a-f]{7,40}\s+(.+)/);
  if (hashMsgMatch) return hashMsgMatch[1].trim();

  // If it looks like full git show output, extract the indented message after Date:
  if (raw.includes("Author:") && raw.includes("Date:")) {
    const lines = raw.split("\n");
    const msgLines: string[] = [];
    let pastDate = false;
    for (const line of lines) {
      if (line.startsWith("Date:")) {
        pastDate = true;
        continue;
      }
      if (pastDate) {
        if (line.startsWith("---") || line.startsWith("diff ") || line.match(/^\s*\d+ file/)) break;
        if (line.startsWith("    Co-Authored-By:")) continue;
        const trimmed = line.replace(/^    /, "").trim();
        if (trimmed) msgLines.push(trimmed);
      }
    }
    if (msgLines.length > 0) return msgLines.join(" ");
  }

  // If it's a clean commit message already, return as-is (truncated)
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.length > 120 ? firstLine.slice(0, 120) + "..." : firstLine;
}

function parseDiffCounts(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function extractProjectName(repoPath: string): string {
  // Strip home directory prefix
  const home = "/Users/";
  let cleaned = repoPath.replace(/\/+$/, "");
  const homeIdx = cleaned.indexOf(home);
  if (homeIdx >= 0) {
    // Remove everything up to and including the username
    const afterHome = cleaned.slice(homeIdx + home.length);
    const slashIdx = afterHome.indexOf("/");
    cleaned = slashIdx >= 0 ? afterHome.slice(slashIdx + 1) : afterHome;
  }

  const SKIP_SEGMENTS = new Set([
    "target", "debug", "deps", "build", "release",
    "node_modules", "dist", ".next", ".git",
  ]);
  const parts = cleaned.split("/").filter(Boolean);
  const kept: string[] = [];
  for (let i = parts.length - 1; i >= 0 && kept.length < 2; i--) {
    if (!SKIP_SEGMENTS.has(parts[i])) {
      kept.unshift(parts[i]);
    }
  }
  if (kept.length >= 2) return kept.join("/");
  if (kept.length === 1) return kept[0];
  return repoPath || "unknown";
}


const FILE_DESCRIPTIONS: Record<string, string> = {
  md: "documentation",
  mdx: "documentation",
  txt: "documentation",
  ts: "TypeScript code",
  tsx: "React components",
  js: "JavaScript code",
  jsx: "React components",
  rs: "Rust code",
  py: "Python code",
  css: "styles",
  scss: "styles",
  html: "markup",
  json: "configuration",
  toml: "configuration",
  yaml: "configuration",
  yml: "configuration",
  sql: "database schema",
  sh: "shell scripts",
  go: "Go code",
  java: "Java code",
  rb: "Ruby code",
  swift: "Swift code",
  svg: "graphics",
  png: "images",
};

function describeFileChanges(files: SessionFile[]): string {
  if (files.length === 0) return "No files changed";

  // Pick the dominant action — the one that matches the most files — instead
  // of concatenating "added and updated and removed" which reads like a robot.
  let created = 0, modified = 0, deleted = 0;
  const groups = new Map<string, { created: number; modified: number; deleted: number }>();
  const dirs = new Set<string>();

  for (const f of files) {
    if (f.kind === "file_create") created++;
    else if (f.kind === "file_delete") deleted++;
    else modified++;

    const name = f.path.split("/").pop() ?? "";
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    const typeDesc = FILE_DESCRIPTIONS[ext] ?? "files";

    const g = groups.get(typeDesc) ?? { created: 0, modified: 0, deleted: 0 };
    if (f.kind === "file_create") g.created++;
    else if (f.kind === "file_delete") g.deleted++;
    else g.modified++;
    groups.set(typeDesc, g);

    const parts = f.path.split("/");
    if (parts.length >= 2) {
      const dir = parts.slice(-2, -1)[0];
      if (dir && !["src", "app", "lib", "public"].includes(dir)) dirs.add(dir);
    }
  }

  const dominantVerb =
    modified >= created && modified >= deleted ? "Updated" :
    created >= deleted ? "Added" : "Removed";

  // Build natural description
  const parts: string[] = [];
  for (const [type, counts] of groups) {
    const actions: string[] = [];
    if (counts.created > 0) actions.push("added");
    if (counts.modified > 0) actions.push("updated");
    if (counts.deleted > 0) actions.push("removed");
    parts.push(`${actions.join(" and ")} ${type}`);
  }

  // Short-circuit: if there's one dominant type + one dominant action, return
  // a tight "Updated 3 React components" instead of building the long sentence.
  if (groups.size === 1 && [created, modified, deleted].filter((n) => n > 0).length === 1) {
    const [type] = [...groups.keys()];
    const count = files.length;
    return `${dominantVerb} ${count} ${type}`;
  }
  void dominantVerb;

  let desc = parts.length > 0
    ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts.length > 1 ? ", " + parts.slice(1).join(", ") : "")
    : `Changed ${files.length} files`;

  // Add scope context
  const dirList = [...dirs];
  if (dirList.length === 1) {
    desc += ` in ${dirList[0]}`;
  } else if (dirList.length > 1) {
    desc += ` across ${dirList.slice(0, 2).join(" and ")}`;
  }

  return desc;
}

export function groupEventsIntoSessions(
  events: AgentEvent[],
  commitGroups: CommitGroup[],
  costSummary: CostSummary,
): ProjectGroup[] {
  // 1. Sort events ascending by timestamp
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // 2. Group events by agent, splitting when gap > 5min
  const SESSION_GAP_MS = 5 * 60 * 1000;
  const rawSessions: { agent: string; events: AgentEvent[] }[] = [];

  const agentBuffers = new Map<string, AgentEvent[]>();

  for (const evt of sorted) {
    const buf = agentBuffers.get(evt.agent);
    if (buf && buf.length > 0) {
      const lastTime = new Date(buf[buf.length - 1].timestamp).getTime();
      const thisTime = new Date(evt.timestamp).getTime();
      if (thisTime - lastTime > SESSION_GAP_MS) {
        rawSessions.push({ agent: evt.agent, events: [...buf] });
        agentBuffers.set(evt.agent, [evt]);
      } else {
        buf.push(evt);
      }
    } else {
      agentBuffers.set(evt.agent, [evt]);
    }
  }

  // Flush remaining buffers
  for (const [agent, buf] of agentBuffers) {
    if (buf.length > 0) {
      rawSessions.push({ agent, events: buf });
    }
  }

  // 3. Build SessionGroups
  const costByAgent = new Map<string, number>();
  for (const ac of costSummary.agents) {
    costByAgent.set(ac.agent, ac.total_cost_usd);
  }

  const sessions: SessionGroup[] = rawSessions.map((raw, idx) => {
    const startTime = raw.events[0].timestamp;
    const endTime = raw.events[raw.events.length - 1].timestamp;
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    // Determine repo path from file paths
    const filePaths = raw.events
      .map((e) => e.file_path)
      .filter((p): p is string => p !== null);
    let repoPath = "";
    if (filePaths.length > 0) {
      // Use the common prefix directory
      const parts = filePaths[0].split("/");
      repoPath = parts.length > 2 ? parts.slice(0, -1).join("/") : filePaths[0];
    }

    // Collect unique files with diff stats (skip directory-only paths)
    const fileMap = new Map<string, SessionFile>();
    for (const evt of raw.events) {
      if (evt.file_path && evt.file_path.split("/").pop()?.includes(".")) {
        const existing = fileMap.get(evt.file_path);
        const counts = evt.diff ? parseDiffCounts(evt.diff) : { added: 0, removed: 0 };
        if (existing) {
          existing.added += counts.added;
          existing.removed += counts.removed;
          if (evt.diff && !existing.diff) existing.diff = evt.diff;
        } else {
          fileMap.set(evt.file_path, {
            path: evt.file_path,
            kind: evt.kind,
            diff: evt.diff,
            added: counts.added,
            removed: counts.removed,
          });
        }
      }
    }

    // Find best commit message from commitGroups matching agent and time window
    let description = "";
    let confidence = 0;
    let hasWarning = false;

    // Also check git_commit events in this session for a commit message
    const gitCommitEvent = raw.events.find((e) => e.kind === "git_commit" && e.diff);
    const commitMsgFromDiff = gitCommitEvent?.diff ? extractCommitMessage(gitCommitEvent.diff) : null;

    const matchingCommit = commitGroups.find((cg) => {
      if (cg.agent !== raw.agent) return false;
      const commitMs = new Date(cg.timestamp).getTime();
      return commitMs >= startMs - 60000 && commitMs <= endMs + 60000;
    });

    if (matchingCommit) {
      description = extractCommitMessage(matchingCommit.commit_message);
      confidence = matchingCommit.confidence_score;
      hasWarning = matchingCommit.confidence_score < 75;
    } else if (commitMsgFromDiff) {
      description = commitMsgFromDiff;
      // Compute confidence from file heuristics when no commit data
      const fc = fileMap.size;
      confidence = fc <= 3 ? 85 : fc <= 8 ? 70 : fc <= 15 ? 55 : 40;
    } else {
      // Generate plain English description from file changes
      const fc = fileMap.size;
      confidence = fc <= 3 ? 85 : fc <= 8 ? 70 : fc <= 15 ? 55 : 40;
      const sessionFiles = [...fileMap.values()].filter((f) => {
        const name = f.path.split("/").pop() ?? "";
        return name.includes(".");
      });
      description = describeFileChanges(sessionFiles);
    }

    // Apportion cost by session count for this agent
    const agentTotalCost = costByAgent.get(raw.agent) ?? 0;
    const agentSessionCount = rawSessions.filter((s) => s.agent === raw.agent).length;
    const costUsd = agentSessionCount > 0 ? agentTotalCost / agentSessionCount : 0;

    return {
      id: `${raw.agent}-${idx}-${startTime}`,
      agent: raw.agent,
      repoPath,
      startTime,
      endTime,
      description,
      files: Array.from(fileMap.values()),
      confidence,
      costUsd,
      hasWarning,
      hostKind: "unknown",
      hostPid: null,
      model: null,
      isLive: false,
      summaryPlainEnglish: null,
      summaryGeneratedAt: null,
    };
  });

  // 5. Group sessions by repoPath into ProjectGroups
  const projectMap = new Map<string, SessionGroup[]>();
  for (const session of sessions) {
    const key = session.repoPath || "unknown";
    const list = projectMap.get(key) ?? [];
    list.push(session);
    projectMap.set(key, list);
  }

  const projects: ProjectGroup[] = [];
  for (const [repoPath, projectSessions] of projectMap) {
    const agents = [...new Set(projectSessions.map((s) => s.agent))];
    // Sort sessions within project by most recent first
    projectSessions.sort(
      (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime(),
    );
    projects.push({
      project: extractProjectName(repoPath),
      repoPath,
      agents,
      sessions: projectSessions,
    });
  }

  // 6. Sort projects by most recent session first
  projects.sort((a, b) => {
    const aLatest = a.sessions[0]?.endTime ?? "";
    const bLatest = b.sessions[0]?.endTime ?? "";
    return new Date(bLatest).getTime() - new Date(aLatest).getTime();
  });

  return projects;
}

export function groupSessionsByAgent(
  projects: ProjectGroup[],
  events: AgentEvent[],
  costSummary: CostSummary,
): AgentGroup[] {
  const allSessions = projects.flatMap((p) => p.sessions);

  // Group sessions by agent
  const agentMap = new Map<string, SessionGroup[]>();
  for (const session of allSessions) {
    const list = agentMap.get(session.agent) ?? [];
    list.push(session);
    agentMap.set(session.agent, list);
  }

  // Determine active agents (events in last 2 min)
  const twoMinAgo = Date.now() - 2 * 60 * 1000;
  const activeAgents = new Set<string>();
  for (const evt of events) {
    if (new Date(evt.timestamp).getTime() > twoMinAgo) {
      activeAgents.add(evt.agent);
    }
  }

  // Build cost map
  const costByAgent = new Map<string, number>();
  for (const ac of costSummary.agents) {
    costByAgent.set(ac.agent, ac.total_cost_usd);
  }

  const groups: AgentGroup[] = [];
  for (const [agent, sessions] of agentMap) {
    // Sort sessions newest first
    sessions.sort(
      (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime(),
    );
    groups.push({
      agent,
      displayName: agentDisplayName(agent),
      isActive: activeAgents.has(agent),
      sessions,
      totalCost: costByAgent.get(agent) ?? 0,
    });
  }

  // Active agents first, then by most recent session
  groups.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aLatest = a.sessions[0]?.endTime ?? "";
    const bLatest = b.sessions[0]?.endTime ?? "";
    return new Date(bLatest).getTime() - new Date(aLatest).getTime();
  });

  return groups;
}

/**
 * Overlay live-session metadata (host_kind, model, is_live, plain-English
 * description) from the daemon onto the grouped SessionGroups.
 *
 * Session IDs from the daemon are raw CLI session UUIDs, while SessionGroup.id
 * is a synthetic `${agent}-${idx}-${startTime}` key, so direct id matching
 * rarely works. Instead we correlate by (agent, repoPath, overlapping time
 * range). The best-overlap match wins; unmatched rows and sessions are left
 * untouched.
 */
export function enrichSessionsWithLiveData(
  projects: ProjectGroup[],
  liveSessions: LiveSessionRow[],
): ProjectGroup[] {
  if (liveSessions.length === 0) return projects;

  const overlapMs = (aStart: number, aEnd: number, bStart: number, bEnd: number): number => {
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  };

  return projects.map((project) => ({
    ...project,
    sessions: project.sessions.map((session) => {
      // Fast path: direct id match (works if event session_ids get into g.id later)
      const direct = liveSessions.find((r) => r.session_id === session.id);
      if (direct) {
        return {
          ...session,
          hostKind: direct.host_kind,
          hostPid: null,
          model: direct.model,
          isLive: direct.is_live,
          summaryPlainEnglish: direct.description || null,
          summaryGeneratedAt: null,
        };
      }

      // Fallback: correlate by agent + repoPath + time-range overlap
      const sStart = new Date(session.startTime).getTime();
      const sEnd = new Date(session.endTime).getTime();
      let best: { row: LiveSessionRow; overlap: number } | null = null;
      for (const row of liveSessions) {
        if (row.agent !== session.agent) continue;
        if (row.repo_path && session.repoPath && row.repo_path !== session.repoPath) continue;
        const rStart = new Date(row.started_at).getTime();
        const rEnd = new Date(row.ended_at).getTime();
        const ov = overlapMs(sStart, sEnd, rStart, rEnd);
        if (ov > 0 && (!best || ov > best.overlap)) {
          best = { row, overlap: ov };
        }
      }
      if (!best) return session;
      return {
        ...session,
        hostKind: best.row.host_kind,
        hostPid: null,
        model: best.row.model,
        isLive: best.row.is_live,
        summaryPlainEnglish: best.row.description || null,
        summaryGeneratedAt: null,
      };
    }),
  }));
}
