# Vigil Dashboard Redesign — Design Spec

**Status:** proposed
**Date:** 2026-04-16
**Author:** Costa Xanthos (design) + Claude (draft)

---

## 1. TL;DR

Vigil today is a vertical timeline of past agent activity. We reshape it into a three-pane live dashboard — left rail shows currently running AI coding agents grouped by the terminal/app they were launched from, middle pane shows a plain-English narration of what the selected session is doing, right rail shows the files being changed. The app becomes a glanceable "what's my computer doing right now, and should a non-coder be worried." We add host detection (process tree walking), a summary translator that shells out to the user's own `claude` or `codex` CLI (no API key management), and a wider default window. Vigil stays a read-only monitor — Conductor drives the train, Vigil watches it.

---

## 2. Why now

- The current app is essentially a git log viewer. It answers *"what changed"* but not *"what is happening."*
- The target user is increasingly non-technical ("shipping code" but not reading diffs). Developer-speak summaries — even the agent's own words like *"refactoring the auth middleware to use the new token format"* — fail them.
- Multiple agents now run simultaneously (Claude Code in Ghostty, Conductor in a separate window, Cursor AI in its editor). There is no one place to see all of it.
- Existing screen spend: 900×700 scrolling session list. Wastes the format it's designed for.

---

## 3. Shape of the product

**Three panes, fixed default widths, resizable.** Inspired directly by Conductor's workspace UI, adapted because Vigil observes rather than drives.

```
┌──────────────┬──────────────────────────────────┬──────────────┐
│  LEFT RAIL   │          MIDDLE PANE             │  RIGHT RAIL  │
│              │                                  │              │
│  Active now  │  Session header                  │  All · Changes · Checks · Review │
│  ────────    │  ─────────────                   │  ────────────────────── │
│  Host A      │  What's happening                │  file1    +21 -21       │
│   session 1  │    (plain-English summary)       │  file2    +11 -10       │
│   session 2  │  ─────────────                   │  file3    +1  -1        │
│  Host B      │  Activity stream                 │  ...                    │
│   session 3  │    8:09  Edit  FeaturesGrid.tsx  │                         │
│  Host C      │    8:09  Bash  npm typecheck     │  Setup · Run · Terminal │
│   session 4  │    8:10  Edit  page.tsx          │                         │
│              │    now   ●     Thinking — staging│                         │
│  Idle hosts  │                                  │                         │
│              │  Opus 4.7 · 42K · $0.63 · 8 tools│                         │
└──────────────┴──────────────────────────────────┴──────────────┘
```

**Default window: 1280×800.** Minimum 1024×640. The current 900×700 is a sidebar killer.

### 3.1 Left rail — "Active now"

- Semi-transparent background (`rgba(24,24,27,0.55)` + backdrop-blur 20px) against the middle pane, as requested. Reads as glass.
- Two-level grouping: **Host → Session**.
- Each host row shows host name + pulsing dot in host color + active session count. Examples of host colors: Ghostty `#00ff88`, Conductor `#a78bfa`, Cursor `#00d9ff`, iTerm2 `#ffb800`, Terminal.app `#60a5fa`, Warp `#f472b6`.
- Each session row shows: session title (or commit-inspired description), one-word model tag (e.g. *Opus*, *Sonnet*, *GPT-5*), repo name, diff stats `+X -Y`. Selected session has a colored left border and tinted background matching the host color.
- Hosts with no currently-running sessions collapse into a single dim "Idle" line at the bottom of the rail.
- "Active now" count in the rail header is the sum of running sessions across all hosts.

### 3.2 Middle pane — session detail

- **Session header** — title, repo/branch line, running-dot pill, elapsed time since session start.
- **"What's happening" block** — the core new UX. 2-4 sentences of truly plain-English description of what the agent is doing, generated fresh every ~30 seconds or when the agent finishes a burst of tool calls and posts a new assistant message (whichever comes first). Reads to a non-coder. Source: shells out to the user's `claude` or `codex` CLI with a condensed prompt built from the session's recent JSONL turns + file diffs. Updates in place.
- **Activity stream** — monospaced, dense. One line per event: timestamp, glyph, action, target, diff stats. Live-tailing, newest at bottom, auto-scroll unless the user scrolls up.
- **Footer** — model tag, cumulative tokens/cost, tool-call count. Mirrors Conductor's info density.

### 3.3 Right rail — changes

- Tabs: **All files · Changes · Checks · Review**. V1 ships Changes populated (file list with statuses + diff stats). Other tabs are stubbed visual placeholders for V2.
- Clicking a file row loads its diff in a bottom drawer (re-uses existing `DiffViewer`).
- Bottom strip: collapsed Setup/Run/Terminal tabs (V2; visible placeholder in V1 to preserve layout).

---

## 4. Data model changes

### 4.1 New concept: Host

A `Host` is the terminal emulator or IDE-style app that launched the agent session. It is *not* the agent brand.

```ts
type HostKind =
  | "ghostty" | "iterm2" | "terminal" | "warp" | "kitty" | "alacritty"
  | "conductor" | "cursor" | "vscode" | "zed" | "windsurf"
  | "unknown";

interface Host {
  kind: HostKind;
  pid: number;              // root host process
  launchedAt: string;       // first observed
  activeSessionIds: string[];
}
```

`Host` is inferred at session-start time by walking the agent process's parent chain until we hit a known ancestor name. Result is cached per session (hosts don't change mid-session).

### 4.2 Session extensions

```ts
interface SessionGroup {
  // existing fields preserved
  hostKind: HostKind;              // NEW
  hostPid: number | null;          // NEW
  model: string | null;            // NEW — e.g., "claude-opus-4-7", "gpt-5-codex"
  isLive: boolean;                 // NEW — true if the underlying agent process is still running
  summaryPlainEnglish: string | null;  // NEW — cached output of translator
  summaryGeneratedAt: string | null;   // NEW
}
```

`isLive` separates "happening right now" from "closed window of past edits." A session is live if: its host process is still running AND the source it writes to (e.g. JSONL) is still being appended.

### 4.3 Data sources per session

| Agent            | Primary source                              | Live-tailable? |
|------------------|---------------------------------------------|----------------|
| Claude Code      | `~/.claude/projects/*/*.jsonl`              | Yes (append-only) |
| Conductor        | Same — wraps Claude Code underneath         | Yes |
| Codex CLI        | Codex CLI log directory (exact path confirmed during implementation) | Yes (append-only log) |
| Cursor           | `~/Library/Application Support/Cursor/logs/<ts>/window*/exthost/output_logging_*/1-Cursor Agent.log` (plaintext) or SQLite `state.vscdb` | Log file tails live; SQLite requires polling |
| Other            | File-change heuristics (existing daemon)    | Indirect |

V1 ships JSONL integration (covers Claude Code + Conductor — biggest slice of real usage). Cursor and Codex come in V1.5.

---

## 5. Summary pipeline ("What's happening")

### 5.1 Auth model — "piggyback, don't login"

- **No user-name/password or email auth.** Vigil doesn't have a cloud identity.
- On first run, Vigil checks for `claude` and `codex` in `$PATH`. If at least one is found and authenticated (detected by running `claude --version` or equivalent), Vigil uses that CLI as its summary engine. No further action required from the user.
- If neither CLI is installed — rare, since the user is literally here to watch Claude Code / Codex — Vigil shows a settings panel with "paste an Anthropic or OpenAI API key." Stored in macOS Keychain via Tauri's keychain plugin.

### 5.2 Generation

- Trigger: new tool-call sequence in the session source, OR 30 seconds elapsed since last summary, whichever comes first. Debounced to avoid thrash.
- Input: last ~4k tokens of session JSONL (user prompts + assistant text + tool names, not tool inputs) plus a compact diff stat line.
- Prompt: a short system prompt that asks for 2-4 sentences describing what the agent is doing, aimed at *"a curious non-programmer who wants to know whether this AI is doing something reasonable."* Examples given in the prompt to nudge away from developer jargon.
- Model: Haiku (`claude haiku` CLI flag, or `-m claude-haiku-4-5-20251001`). Fast, cheap (fractions of a cent per call), accurate for this task.
- Output is cached on the session and persists across app restarts.

### 5.3 Fallback

- If no CLI and no API key: summary block shows the current heuristic description plus a small "Connect Claude for plain-English summaries" CTA. Everything else in Vigil still works.

---

## 6. Host detection

Rust-side, inside the daemon (not the Tauri app), extending `daemon/src/process.rs`.

- On session-start signal (JSONL file created, Claude Code hook fired, etc.), capture the originating PID.
- Walk parent processes via a process-introspection crate (`sysinfo` or similar) until we hit a process whose name matches a known host signature OR we reach PID 1.
- Known signatures (V1): `ghostty`, `iTerm2`, `Terminal`, `Warp`, `Kitty`, `Alacritty`, `Conductor`, `Cursor`, `Code`/`Code - Insiders` (VS Code), `Zed`, `Windsurf`.
- If no match found: `HostKind::Unknown`, host label "Other."
- Cache (session_id → host_kind) in SQLite so the walk runs once per session.

---

## 7. Visual design

### 7.1 Tokens (extending existing Tailwind config)

| Purpose          | Value |
|------------------|-------|
| Pane background (middle) | `#121214` |
| Pane background (rails, translucent) | `rgba(24,24,27,0.55)` with `backdrop-filter: blur(20px)` |
| Pane divider     | `rgba(255,255,255,0.05)` |
| Selected session bg | host-color at 10% alpha + 1px inner shadow at host-color 15% |
| Selected session border-left | 2px, host color |
| Host color dot   | `box-shadow: 0 0 8px <host-color>` for that "alive" feel |
| Text primary     | existing `#F9FAFB` |
| Text secondary   | `rgba(255,255,255,0.55)` |
| Text meta        | `rgba(255,255,255,0.35)` |

### 7.2 Typography

- UI: existing sans stack.
- Activity stream + file list: mono stack, 12px, 1.55 line-height.
- "What's happening" text: 13px, 1.55 line-height, regular weight. Reads like body prose, not UI chrome.

### 7.3 Motion

- Running dot: 2s pulse (opacity 0.6 → 1.0 → 0.6).
- New activity row enters with a 180ms fade + 4px slide-up.
- "What's happening" refresh: cross-fades old → new over 400ms; no layout jump.
- Session selection: 120ms spring on left-rail border + bg tint.

### 7.4 Empty / loading / error states

- **No agents running:** middle pane shows a quiet hero — "No agents active. Vigil will light up when one starts." Plus a hint about how to start a session in one of the supported hosts.
- **Loading first summary:** shimmer in the "What's happening" block, not a spinner. 1-2 seconds max.
- **Summary engine unavailable:** inline banner at the top of the block, one-tap "Configure summaries" opens settings.
- **Daemon disconnected:** red pill in the top-right of the window (not the left rail), with last-heard timestamp; everything else stays rendered from cache.

---

## 8. Onboarding

First run sequence (in order, auto-advance):

1. **Detect daemon.** If absent, show a one-screen installer hint: "Start the Vigil daemon with `vigil start`."
2. **Detect summary engine.** Silently probe `claude` and `codex` CLIs. If found, confirm via a single line at the bottom of the window: "Summaries powered by Claude Code." No dialog, no step.
3. **If neither CLI found:** a single modal: "Vigil uses your own Claude or Codex for plain-English summaries. Install Claude Code, or paste an API key in Settings."
4. **No user sign-in ever.** Vigil does not have a cloud account concept.

---

## 9. Scope

### 9.1 V1 (this spec)

- Three-pane layout, 1280×800 default.
- Host detection for the V1 host list (Ghostty, iTerm2, Terminal.app, Warp, Conductor, Cursor, VS Code, Zed, Kitty, Alacritty, Windsurf).
- Left rail with Host → Session grouping, semi-transparent, host color dots.
- Middle pane: session header, "What's happening" plain-English block, activity stream, model/cost footer.
- Right rail: Changes tab populated (file list + diff view); other tabs as placeholders.
- JSONL-based data source for Claude Code + Conductor sessions.
- Summary pipeline: piggyback `claude` CLI (Haiku), 30-second debounce, Keychain-stored fallback API key.
- Onboarding flow.
- Dead-code cleanup: delete `EventTimeline.tsx`, `EventRow.tsx`, `SetupModal.tsx` — superseded by this design.

### 9.2 V1.5

- Cursor session integration (plaintext log parser + SQLite fallback).
- Codex session integration (log path confirmed during implementation).
- State persistence via the already-installed-but-unused zustand (filters, selected session, pane widths).

### 9.3 V2+

- Tabs Checks / Review / All files populated with real content.
- Setup / Run / Terminal embedded in right rail.
- Notifications (session started / completed / stalled).
- Keyboard navigation across list + panes.
- Multi-window / detachable panes.
- Settings UI polish; provider switching (Anthropic ↔ OpenAI) inside the app.
- Potential "nudge-back" — sending a short message to an observed agent. Out of scope until V2+ because it makes the daemon bidirectional.

### 9.4 Non-goals

- Cloud sync / cross-device.
- Collaboration / shared dashboards.
- GitHub or any OAuth login.
- Writing back to agents (see V2+).
- Supporting every niche terminal emulator (we cover the top 6, unknown hosts bucket into "Other").

---

## 10. Component boundaries

Each of these is independently designable, implementable, and testable:

| Component | Input | Output | Depends on |
|-----------|-------|--------|-----------|
| `HostDetector` (daemon) | process PID | `HostKind` | `sysinfo` |
| `JsonlReader` (daemon) | path pattern | `SessionSnapshot` stream | fs watcher |
| `SummaryEngine` (daemon) | `SessionSnapshot` | plain-English string | `claude`/`codex` subprocess |
| `LeftRail` (app) | live sessions grouped by host | host rows + session rows, selection events | host data |
| `SessionDetail` (app) | selected session id | panel render | session store |
| `ChangesPanel` (app) | selected session id | file list + diff drawer | existing `DiffViewer` |
| `Onboarding` (app) | first-run state | completion signal | host detection, engine probe |

The existing `store.rs` / `commands.rs` split is preserved. New Tauri commands: `get_hosts()`, `get_live_sessions()`, `get_summary(sessionId)`, `refresh_summary(sessionId)`.

---

## 11. Risks and open questions

- **Process tree reliability.** On macOS, some hosts (esp. Conductor) spawn through `launchd` or reparent, breaking the walk. Mitigation: check `ProcessInfo` command line args + environment (`TERM_PROGRAM`, etc.) alongside parent walk.
- **Summary latency.** `claude` CLI cold-start is ~300-800ms. Debouncing plus "show stale while refreshing" should mask this.
- **JSONL privacy.** Vigil reads Claude Code conversations. Must be explicit in onboarding — "Vigil reads your local Claude Code sessions to show what agents are doing. No data leaves your machine unless you connect an API key." Keychain flag for "allow summary engine to send session text to [provider]."
- **Cost creep.** Haiku is cheap but not free. Aggregate a daily cap in settings with a "disable summaries after $X/day" soft switch.
- **Model naming.** The `model` field on SessionGroup needs a source. For Claude Code JSONLs the model is recorded per-turn; for other agents it's a guess unless we read their config.
