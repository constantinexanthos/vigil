# Vigil V2 — UI Beautification + Live Right-Rail Tabs

**Status:** proposed
**Date:** 2026-04-22
**Author:** Costa Xanthos (design) + Claude (draft)
**Follows:** `2026-04-16-vigil-dashboard-redesign-design.md` (V1), `2026-04-22-vigil-v15-cursor-codex-design.md` (V1.5)

---

## 1. TL;DR

Vigil V1 shipped a three-pane live dashboard. V1.5 gave it Cursor and Codex as data sources. V2 makes it beautiful to watch and fills in the three right-rail tabs that say "not wired yet" with real live content.

Four concurrent workstreams, all inside the existing three-pane shell:

1. **Summary block redesign** — the "What's happening" paragraph becomes a layered block: plain-English paragraph on top, a live pulse line showing the current action ("Running `npm test`…"), and a timestamped feed of milestones underneath.
2. **Model indicator** — a compact model chip (`OPUS` / `SONNET` / `GPT-5`) appears on every session row in the left rail, plus a full pill ("Claude Opus 4.7") in the session header. Removes redundant model line from the footer.
3. **Right-rail tabs go live** — `All files`, `Checks`, and `Review` tabs populate with real content polled through `useDaemonData`. No more "not wired yet" placeholders.
4. **Polish pass across the three-pane** — typography scale, motion rhythm, empty/loading/error states, hover/focus polish, semantic color calibration. Nothing gets redesigned structurally; everything gets tighter.

---

## 2. Why now

- V1.5 just shipped. The foundation (three-pane, host detection, multi-source tailers, live sessions query) is stable and tested.
- Three tabs currently tell users "This tab is not wired yet. For V1 the changes tab is the canonical view." This is a visible incompleteness signal — filling it in is the single highest-leverage perceived-quality move available.
- The daemon already has `trust`, `hallucination`, `collision detection`, `github`, `cost`, and `events rollup` modules whose output is either CLI-only or emitted via Tauri but never consumed by the UI. V2 is mostly surfacing what already exists.
- Model-per-session is in `SessionGroup.model` today but only appears in the SessionFooter as one of four dense fields. Moving it up makes the multi-agent-on-screen proposition legible.
- Motion / typography / empty-state polish is the kind of work that compounds with every future feature. Doing it now bakes the pattern in.

---

## 3. Shape of the work

### 3.1 Summary block — layered + timelined

Replaces the current `SummaryBlock.tsx` content structure. Three stacked elements in the middle pane's "What's happening" region:

```
┌──────────────────────────────────────────────────────┐
│  WHAT'S HAPPENING                                     │  label, 9px, 0.45 alpha
│  The AI is making the login page more secure by      │  13px paragraph, 1.55
│  checking the session token before letting someone   │
│  in. It's running the tests to make sure nothing     │
│  broke.                                              │
│                                                        │
│  ● Running `npm test`…                                │  11px mono, host-green, 2s pulse
│                                                        │
│  ────────────────────────────────────                 │  divider
│  8:07  Started on the login bug.                      │  11.5px, 1.8 line-height
│  8:09  Updated how tokens get checked.                │
│  8:10  Ran the tests.                                 │
└──────────────────────────────────────────────────────┘
```

**Paragraph** — the current 2-4 sentence plain-English summary, unchanged in generation. Still sourced from `summarizer::generate_and_cache` (Claude Haiku or Codex).

**Pulse line** — a new single-line "what is the agent doing right now" indicator, driven by the most recent `SessionTurn.tool_names` value from the tailer. The line is derived client-side by mapping the last tool call to a plain-English verb:

| Tool name (substring) | Line |
|-----------------------|------|
| `Edit` / `Write`       | "Editing *<file>*…"   |
| `Bash`                 | "Running `<cmd>`…"    |
| `Read` / `Grep` / `Glob` | "Reading the code…" |
| `WebFetch` / `WebSearch` | "Looking something up…" |
| `Task`                 | "Dispatching a sub-agent…" |
| anything else          | "Working…"             |

Stale after 45s with no new tool call — fades to 0.5 opacity and drops the pulse animation. Goes away entirely when the session is `!isLive`.

**Timelined feed** — appended from the tailer. Each arriving `SessionTurn` where `role == "assistant"` and the text is short and plain (not a tool-use narration) gets a timestamped row. Daemon-side work: the summarizer already produces the plain-English paragraph; we add a second prompt pass that emits a single-line milestone whenever a new assistant turn lands. Caps at the last 6 milestones visible; older rows scroll off the top.

### 3.2 Model indicator — rail chip + header pill

Today `SessionRow` doesn't show model at all; `SessionHeader` doesn't either; `SessionFooter` shows it as one of four comma-separated metadata fields. V2:

- **SessionRow (left rail)** — adds a compact chip `OPUS` / `SONNET` / `HAIKU` / `GPT-5` / `CODEX` right-aligned next to the session title. 9px, 600 weight, color-coded (purple for Claude family, pink for OpenAI family). Rendered from `session.model` with a small mapping function `modelShortName(session.model)`.
- **SessionHeader (middle pane)** — adds a full-name pill "Claude Opus 4.7" next to the existing RUNNING pill. 10px, semi-transparent background in the family color.
- **SessionFooter (middle pane)** — the model segment is **removed**. Footer becomes `42K tokens · $0.63 · 8 tools` — three fields instead of four.

Mapping table (in `app/src/lib/model-tokens.ts`, new file):

```ts
export function modelShortName(model: string | null): string {
  if (!model) return "—";
  const m = model.toLowerCase();
  if (m.includes("opus")) return "OPUS";
  if (m.includes("sonnet")) return "SONNET";
  if (m.includes("haiku")) return "HAIKU";
  if (m.includes("gpt-5")) return "GPT-5";
  if (m.includes("gpt-4")) return "GPT-4";
  if (m.includes("codex")) return "CODEX";
  return "MODEL";
}

export function modelFamilyColor(model: string | null): string {
  if (!model) return "#6b7084";
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku")) return "#a78bfa";
  if (m.includes("gpt") || m.includes("codex")) return "#f472b6";
  return "#6b7084";
}

export function modelLongName(model: string | null): string {
  if (!model) return "Unknown";
  const m = model.toLowerCase();
  // Strip date suffix like "-20260501" from Claude model ids.
  const stripped = m.replace(/-\d{8}$/, "");
  // Common Claude pattern: "claude-<family>-<major>-<minor>"
  const claude = stripped.match(/claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) {
    const [, family, major, minor] = claude;
    const pretty = family.charAt(0).toUpperCase() + family.slice(1);
    return `Claude ${pretty} ${major}.${minor}`;
  }
  if (stripped === "gpt-5-codex" || stripped === "gpt-5" || stripped === "codex") {
    return stripped.toUpperCase().replace("-", " ");
  }
  if (stripped.startsWith("gpt-")) return stripped.toUpperCase();
  return model;
}
```

### 3.3 Right-rail live tabs

The tab bar gains badges reflecting live counts / status:

```
All files 47 · Changes 3 · Checks ! · Review ●2
```

- `All files` — count of distinct files touched in the session.
- `Changes` — count of currently-uncommitted files (existing behavior).
- `Checks` — `!` when any local check is failing, `·` when green, `○` when nothing is running.
- `Review` — red dot with count when there are open review signals (collisions + unresolved hallucinations).

#### 3.3.1 All files — session history rollup

New Tauri command `get_session_files(session_id: string)` that queries distinct file paths + aggregate diff stats + edit count per file, across the session. UI sorts by edit count descending (most-touched files first). Each row: path, `+added -removed`, `N×` edit-count badge. Clicking loads a diff for the most recent edit. Falls back to empty-state ("No files touched yet") when the session just started.

Data shape returned by the Tauri command:

```ts
interface SessionFileRollup {
  path: string;
  total_added: number;
  total_removed: number;
  edit_count: number;
  last_edit_at: string; // ISO-8601
}
```

Query: SELECT across `events` WHERE `session_id = ?` AND `kind IN ('file_create', 'file_modify')`, grouped by `file_path`, with aggregations. Already supportable by the existing schema.

#### 3.3.2 Checks — live test / CI status

Two sections: **Local** and **GitHub Actions**.

**Local checks** require new daemon work. A `checks.rs` module watches the repo for common test/lint runners that the agent is invoking:

- When the tailer sees a `Bash` tool call whose command matches `npm test`, `cargo test`, `cargo check`, `tsc`, `pytest`, `go test`, `ruff check`, `eslint` (configurable allow-list), record a `CheckRun` row.
- When the same command's output stream returns (captured via the Claude JSONL `tool_result`), parse the exit code + a short tail of stdout/stderr into a `status: "ok" | "failing" | "running"` + `summary` field.
- UI polls `get_check_runs(session_id)` and renders each row with a colored dot (green/red/running-pulse) and a time since last run.

Schema addition:

```sql
CREATE TABLE IF NOT EXISTS check_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  command     TEXT NOT NULL,           -- e.g. "npm test"
  status      TEXT NOT NULL,            -- "ok" | "failing" | "running"
  exit_code   INTEGER,
  summary     TEXT,                     -- one-line digest from stdout/stderr
  started_at  TEXT NOT NULL,
  ended_at    TEXT                      -- null while running
);
CREATE INDEX IF NOT EXISTS idx_check_runs_session ON check_runs(session_id);
```

**GitHub Actions** — the daemon already has `github.rs::sync_pr_data` which fetches PR state via `gh` CLI every 60s. Extend it to also fetch check-run status for the PR's head commit (via `gh api repos/:owner/:repo/commits/:sha/check-runs`). Persist to a new `pr_check_runs` table; query from the UI.

If no PR exists for the current branch: Checks tab renders only the Local section.

If the `gh` CLI is not installed or unauthenticated: the GitHub Actions section silently hides with a one-line "Connect `gh` for CI status" CTA at the bottom of the tab.

#### 3.3.3 Review — trust rollup

Three sections: **Confidence**, **Signals**, **Checks OK** (the green list).

**Confidence** — a donut ring rendered with a conic-gradient background, showing the score (0-100) from the existing `trust.rs::compute_confidence`. Plus a one-line "why" derived from the dominant factor (small focused change / tests added / many files / no tests / has collisions). The factors are already computed inside `trust.rs`; expose the top one via a new `confidence_reason: String` field on the existing trust row.

**Signals** — each row is one finding:

- **Collision** (red-tinted card) — "Collision · N agents on <file>. Also being edited by <other-session-title>." Sourced from existing `store::file_collisions`. One row per distinct colliding file.
- **Phantom import** (amber-tinted card) — one per unresolved import flagged by `hallucination.rs`. The module currently has all the infrastructure but its scanner isn't wired into `run_watch`. V2 also wires it.
- **Silent fallback** (amber-tinted card) — V2.1 extension: flag code patterns where the agent silently catches and ignores errors. **Out of scope for V2** — noted here so the UI slot is anticipated.

**Checks OK** — a single collapsed line at the bottom: `✓ Imports resolve (11/12) · ✓ No silent fallbacks · ✓ Tests added`. Each checkmark is a positive signal from `trust.rs`'s factor list, shown to balance the negative signals and avoid the UI feeling accusatory when things are going well.

Empty state — when there are no signals and the confidence score isn't computed yet: `Analyzing… confidence score in a moment` with shimmer on the donut.

### 3.4 Polish pass — the A workstream

Cross-cutting refinements. Each is a one-off PR-sized change:

#### 3.4.1 Typography scale

Establish 5 sizes, use them everywhere:

| Size | Use |
|------|-----|
| 9px, 0.08em letter-spacing, 0.45 alpha, uppercase | labels ("WHAT'S HAPPENING", tab names, metadata headers) |
| 10px | dense mono stats (token counts, cost, diff nums) |
| 11px mono | activity stream rows, file lists, checks |
| 11.5px regular | timelined feed rows, review signal descriptions |
| 13px | body prose (summary paragraph, empty-state copy) |
| 14px, 600 weight | titles (session header, tab-panel headers) |

Audit pass: every `text-[11px]` / `text-xs` / etc. in the frontend gets mapped to one of these. Likely 10-15 touch points. Encoded as Tailwind plugin classes: `text-label`, `text-stat`, `text-mono`, `text-feed`, `text-body`, `text-title`.

#### 3.4.2 Motion rhythm

Standardize timing tokens in `tailwind.config.js`:

```js
transitionDuration: {
  fast: "120ms",     // selection, focus, hover
  base: "180ms",     // row enter, tab switch
  slow: "400ms",     // summary cross-fade, paragraph refresh
}
```

And pulse animations consolidated to one keyframe `pulse-alive` (2s, 0.6 → 1.0 → 0.6) used by: running dot, pulse line dot, check "running" dot. Replace any ad-hoc pulse animations.

Spring for selection border in LeftRail — switch from CSS transition to a 120ms cubic-bezier(0.34,1.56,0.64,1) to give the selection a subtle overshoot.

#### 3.4.3 Empty / loading / error states

- **No agents active** — middle pane shows a centered hero: subtle icon (pulsing circle), text `No agents active.`, subtitle `Vigil will light up when one starts.` Already exists but gets a motion sweep across the icon.
- **First summary loading** — shimmer on the paragraph block (replaces the spinner that isn't there).
- **Summary engine unavailable** — inline banner at the top of the summary block, one-tap `Configure summaries` opens settings.
- **Tab empty** — each tab gets a short one-line empty state. Checks: "No test runs yet. Vigil will capture them as your agent runs `npm test` / `cargo check` / etc." Review: "Analyzing… confidence score in a moment." All files: "No files touched yet."
- **Daemon disconnected** — existing red banner gets a `Reconnecting…` suffix with a spinner, and a `Retry now` link that nudges `useDaemonData` to fetch early.

#### 3.4.4 Hover/focus polish

- Every interactive element gets a visible focus ring (`outline: 1px solid rgba(255,255,255,0.4); outline-offset: 1px`). Currently most don't.
- SessionRow hover: adds `bg-white/5` tint + 1px border-left in host color at 30% alpha (echoes the selected state at lower intensity).
- Tab buttons: hover underline appears at 50% opacity before click.
- File rows in right-rail tabs: hover reveals a right-aligned chevron.

#### 3.4.5 Color calibration

Define semantic colors in the Tailwind theme:

```js
colors: {
  ok: "#4ade80",       // previously various #00ff88 / #4ade80 mix
  warn: "#fbbf24",
  bad: "#ef4444",
  info: "#60a5fa",
  dim: "rgba(255,255,255,0.45)",
  dimmer: "rgba(255,255,255,0.35)",
  dimmest: "rgba(255,255,255,0.25)",
}
```

Audit sweep replaces hex literals with `text-ok` / `bg-warn/10` / etc. Running dots switch from pure saturated green (`#00ff88`) to the calibrated `ok` green — a hair less intense, easier on the eye when three sessions are pulsing at once.

---

## 4. Data & backend changes

### 4.1 Daemon

- **New module**: `daemon/src/checks.rs` — parses Bash tool-call commands, maps to check runs, persists to new `check_runs` table, updates on tool_result arrival.
- **New table**: `check_runs` (see §3.3.2).
- **Extension to `github.rs`**: add `fetch_pr_check_runs(pr_number)` + new `pr_check_runs` table + corresponding `sync_check_runs` call in the 60-second PR sync loop.
- **Wire `hallucination.rs` into `run_watch`**: the scanner exists but is never called. V2 adds a debounced post-edit pass — when `tool_result` lands for an `Edit`/`Write` tool call, the scanner runs on the modified file and persists phantom-import findings.
- **Expose `confidence_reason` on trust queries**: extend `trust::compute_confidence` to also return the dominant-factor string; surface through the existing `query_trust` path.
- **New Tauri commands**:
  - `get_session_files(session_id)` → `Vec<SessionFileRollup>`
  - `get_check_runs(session_id)` → `Vec<CheckRun>`
  - `get_pr_check_runs(repo_path)` → `Vec<PrCheckRun>`
  - `get_review_signals(session_id)` → `ReviewSignals { confidence, collisions, hallucinations, checks_ok }`
  - `get_pulse(session_id)` → `Option<PulseLine { verb, target, ts }>` (derives the current pulse from the most recent turn's tool_names + a small command-parse helper)

### 4.2 Frontend

- **New files**:
  - `app/src/lib/model-tokens.ts` — model short/long/family-color helpers (§3.2)
  - `app/src/lib/tool-verbs.ts` — tool-to-plain-English mapping (§3.1)
  - `app/src/components/AllFilesPanel.tsx`
  - `app/src/components/ChecksPanel.tsx`
  - `app/src/components/ReviewPanel.tsx`
  - `app/src/components/ConfidenceDonut.tsx` — reusable donut SVG/conic
  - `app/src/components/PulseLine.tsx` — the "Running `npm test`…" micro-component
  - `app/src/components/MilestoneFeed.tsx` — the timelined feed under the summary paragraph
  - `app/src/components/ModelChip.tsx` — compact rail chip
  - `app/src/components/ModelPill.tsx` — full header pill
- **Modified**:
  - `app/src/components/SummaryBlock.tsx` — compose paragraph + PulseLine + MilestoneFeed
  - `app/src/components/SessionRow.tsx` — add ModelChip
  - `app/src/components/SessionHeader.tsx` — add ModelPill next to RUNNING
  - `app/src/components/SessionFooter.tsx` — remove model segment; now 3 fields
  - `app/src/components/layout/RightRail.tsx` — render All files / Checks / Review panels per tab
  - `app/src/hooks.ts` (useDaemonData) — add polling for the four new Tauri commands, session-scoped
  - `app/tailwind.config.js` — typography scale, transition duration, semantic colors, pulse-alive keyframe
  - `app/src/types.ts` — new types for rollup, check runs, review signals, pulse line

### 4.3 No schema migration for Claude-side data

Everything we already have stays put. Only new additions are the `check_runs` table and `pr_check_runs` table. Existing DBs survive an upgrade via the defensive ALTER / CREATE IF NOT EXISTS pattern already in `store.rs::init_schema`.

---

## 5. Visual design tokens

Extending the existing Tailwind config (partial — full shape in §3.4):

```js
theme: {
  extend: {
    fontSize: {
      label: ["9px", { letterSpacing: "0.08em", textTransform: "uppercase" }],
      stat: ["10px", { lineHeight: "1.5" }],
      mono: ["11px", { lineHeight: "1.55" }],
      feed: ["11.5px", { lineHeight: "1.8" }],
      body: ["13px", { lineHeight: "1.55" }],
      title: ["14px", { fontWeight: 600 }],
    },
    transitionDuration: { fast: "120ms", base: "180ms", slow: "400ms" },
    colors: { ok: "#4ade80", warn: "#fbbf24", bad: "#ef4444", info: "#60a5fa" },
    keyframes: {
      "pulse-alive": {
        "0%,100%": { opacity: "0.6" },
        "50%":     { opacity: "1"   },
      },
    },
    animation: { "pulse-alive": "pulse-alive 2s ease-in-out infinite" },
  },
},
```

Model family colors:
- Claude family (Opus/Sonnet/Haiku): `#a78bfa` (lavender)
- OpenAI family (GPT/Codex): `#f472b6` (pink)
- Unknown: `#6b7084` (neutral gray)

Trust semantic colors use the semantic `ok` / `warn` / `bad` from above, so the confidence donut color matches the tab's status indicator.

---

## 6. Component boundaries

| Component | Input | Output | Depends on |
|-----------|-------|--------|-----------|
| `PulseLine` | `session: SessionGroup`, `lastTurn: SessionTurn \| null` | single rendered row | `tool-verbs.ts` |
| `MilestoneFeed` | `sessionId: string`, `milestones: Milestone[]` | timelined rows | new daemon prompt for milestones |
| `ModelChip` | `model: string \| null` | compact pill | `model-tokens.ts` |
| `ModelPill` | `model: string \| null` | full pill | `model-tokens.ts` |
| `AllFilesPanel` | `sessionId: string` | file list with rollup | `get_session_files` |
| `ChecksPanel` | `sessionId: string`, `repoPath: string` | local + GH sections | `get_check_runs`, `get_pr_check_runs` |
| `ReviewPanel` | `sessionId: string` | confidence + signals | `get_review_signals` |
| `ConfidenceDonut` | `score: 0..100` | SVG ring | none |
| `checks.rs` (daemon) | Bash tool call + tool_result | `CheckRun` rows | existing tailer |
| `hallucination` wiring | `Edit` / `Write` tool_result | phantom-import findings | existing `hallucination::scan_file` |

Each is independently testable. `PulseLine`, `MilestoneFeed`, `ModelChip`, `ModelPill`, `ConfidenceDonut` are all stateless pure-render components, unit-testable with React Testing Library.

---

## 7. Risks & open questions

- **Milestone feed daemon work is a new prompt pass.** Extra Haiku invocation per significant assistant turn. Cost: <$0.0005 per call, called maybe once every 20 seconds while a session is active. Mitigation: aggressive debounce (only emit a new milestone when a non-tool-call assistant turn lands, not on every tool-use). Cap at 6 visible; oldest rolls off.
- **Local check parsing is heuristic.** `npm test` output varies. `cargo test`'s `test result: ok. N passed;` line is regex-parseable; `npm test`'s output depends on the runner. V2 parses the last line of stderr as the summary and reads exit code for status; if exit code 0 we say "ok", else "failing" with the tail. Imperfect but good enough.
- **GitHub Actions requires `gh` auth.** If the user has `gh` installed but is unauthenticated, the API calls 401. Handle gracefully — log once, hide GH section silently.
- **Hallucination scanner is CPU-bound.** Running it post-every-edit could become expensive on large repos. Debounce at 2 seconds; only scan the modified file (not the whole tree); cap at 1 scan per file per 10 seconds.
- **Confidence donut rendering.** `conic-gradient` doesn't animate smoothly. Use CSS transitions on a `--progress` custom property consumed by the gradient — works in modern Chromium (Tauri webview).
- **"Right now" pulse line staleness.** If the agent's Bash command hangs for 45+ seconds, the line goes stale. We fade to 0.5 opacity but leave the text — users can tell "it was doing X and hasn't updated" rather than the line vanishing.

---

## 8. Scope

### 8.1 V2 (this spec)

- Summary block = paragraph + pulse line + milestone feed
- Model chip on SessionRow; full pill on SessionHeader; removed from SessionFooter
- All files tab live (new Tauri command + panel)
- Checks tab live (new daemon module + GitHub Actions sync extension + two Tauri commands + panel)
- Review tab live (hallucination wiring + confidence reason exposure + review-signals Tauri command + panel + ConfidenceDonut)
- Polish pass: typography scale, transition durations, semantic colors, empty/loading/error states, hover/focus polish, pulse-alive consolidation
- All tabs gain live count/status badges

### 8.2 V2.1 (next)

- Silent-fallback signal in Review tab (new hallucination-style scanner for `try {} catch {}` / `.catch(() => null)` patterns)
- Setup / Run / Terminal strip at the bottom of the right rail (currently a placeholder bar)
- Nudge-back — send a short message to an observed agent (makes daemon bidirectional)

### 8.3 Out of scope

- Aider / Cline / Claude Squad sources (V2.5 or later)
- OpenTelemetry OTLP receiver (POSITIONING Phase 2)
- Settings UI for backend switching (V3)
- Multi-window / detachable panes

---

## 9. Success criteria

Spec is satisfied when:

1. A user starts Claude Code in a terminal, opens Vigil, and within 10 seconds sees:
   - A session in the left rail with an `OPUS` (or family-appropriate) chip.
   - A full `Claude Opus 4.7` pill in the session header.
   - A summary paragraph rendering with shimmer-to-prose once the first Haiku call returns.
   - A pulse line showing the current tool (`Running npm test…` when applicable).
   - A milestone appearing in the timelined feed per assistant turn.
2. Clicking through the four right-rail tabs shows:
   - Changes (as today).
   - All files (sorted by edit frequency).
   - Checks with at least one Local row if the agent has invoked a test runner, plus a GH section when the repo has an open PR and `gh` is authenticated.
   - Review with a confidence donut + any applicable signals.
3. All four tabs update in real time (≤2s polling).
4. No console errors. No "not wired yet" text anywhere. No `console.log` left over.
5. Daemon continues to work if: `gh` missing, hallucination scanner disabled, no model known, no tool_name recorded. Every new panel handles `null` / empty gracefully.
