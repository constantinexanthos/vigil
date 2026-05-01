# V3 Orchestration State — 2026-05-01

> Snapshot before clearing the orchestrator session. Resume from this file.

## Conductor agent status

| Agent | Branch | Status | Last commit | Notes |
|-------|--------|--------|-------------|-------|
| 1 — JSONL session detection | `claude/v3-jsonl-session-detection` | ✅ merged | merge `cf7fa52` on main | 116 daemon + 3 tauri tests, decoder limitation for paths with `-` |
| 2 — Glyph infra + type sweep | `claude/v3-design-glyphs-and-glass` | ✅ merged | merge `f74b385` on main | 125 app tests, geometric stand-ins (NOT real brand logos — see Agent 4) |
| 3 — Agentic Overview | `claude/v3-agentic-overview` | 🟡 in progress | (TBD — Agent 3 to write a memo before clearing its own context) | Brainstorm Q1–Q5 answered (see below); blocked on Claude API quota |
| 4 — Real brand logos | (none yet) | ⏳ prompt ready | — | Authenticity follow-up to Agent 2; full prompt below |

`origin/main` is at `f74b385` plus whatever the orchestrator has committed
since (e.g., this state file). All three free agent slots in Conductor
should be assumed in use; clear them per the strategy in this file's
"Per-terminal /clear" section.

## Agent 3 design decisions (Q1–Q5 answers)

If Agent 3 needs to be re-prompted after its `/clear`, these are the
already-decided answers — DO NOT re-litigate.

- **Q1 — 24h activity chart shape:** stacked bars (one bar per hour,
  stacked per-agent, color via `agentColor()`). Floor non-zero stack
  segments to 2 px. Empty state matters more than populated. Linear
  Y axis, no axis labels by default — tick marks at 00:00 / 06:00 /
  12:00 / 18:00 / now.
- **Q2 — Hotspots definition:** two-list. Collisions stay as the
  red-banner trigger; "Most edited" is a separate panel using raw
  event count. New Tauri command `get_top_edited_files(since_minutes,
  limit)` → `Vec<FileHeat { path, edit_count, agents, last_event_at }>`.
  Heat bar = relative to max in result, not absolute. Path display:
  repo-relative (`displayPath` pattern from `AllFilesPanel`). Agent
  dots, not names. Mark dual-list (collision + hotspot) rows with `▲`.
- **Q3 — Agent card click behavior:** drill-in to that agent's most
  recent live session (newest `started_at`). Filter `liveSessions` to
  `is_live === true` (or `ended_at` within ~5 min) before grouping —
  every card is then guaranteed clickable; no "disabled" state needed.
  Card = full-area `<button>`, hover bg shift via `hover:bg-white/5`,
  focus-visible ring `outline-1 outline-offset-1 outline-white/40`.
- **Q4 — Launch behavior + auto-bounce:**
  - Launch = (c) refined: respect persisted `selectedSessionId` IFF
    that session is still in `liveSessions` with `is_live: true`.
    Otherwise (closed / not present / no persisted) → Overview, clear
    the persisted ID. New install + agents present → Overview.
  - Auto-bounce = (b) confirmed: do NOT yank user out when the session
    they're inspecting ends mid-flight; let them review the closed-state
    detail. ⌘1 is the explicit affordance to leave. Optional: tiny
    "Session ended just now · ⌘1 for Overview" hint at the top of the
    per-session view when `is_live` flips false during the session.
- **Q5 — Top status bar placement:** stats (burn rate / agent count /
  file changes today) inside MiddlePane Overview, NOT in the global
  TopBar. TopBar gains a minimal mode indicator, not pills:
  `Vigil ●            Overview · Session            ⌘K`
  - Two text links separated by a middle dot
  - Active = `text-white` + 1px underline; inactive = `text-white/45`
  - Disabled "Session" link (`text-white/25`, `cursor-not-allowed`)
    when no `selectedSessionId` or persisted ID points to nothing live
  - `⌘1` / `⌘2` hints as `title=` tooltips, not visible chrome
  - Click toggles in addition to ⌘1/⌘2 keyboard

## Standing follow-ups not yet dispatched

### Agent 4 — Real brand SVGs (authenticity pass)

Dispatch into a freed Conductor slot with this prompt:

```
You are working on Vigil at /Users/costaxanthos/conductor/repos/vigil.

REQUIRED SKILLS — invoke in order:
  1. superpowers:using-superpowers
  2. superpowers:using-git-worktrees
  3. superpowers:test-driven-development
  4. frontend-design                     (judging visual fidelity)
  5. superpowers:verification-before-completion
At end: superpowers:finishing-a-development-branch.

CONTEXT
Branch from main: `git checkout -b claude/v3-real-brand-logos`. Read
app/src/components/AgentGlyph.tsx and app/src/components/HostGlyph.tsx
— they exist with bespoke geometric stand-ins (rotated square for
Cursor, asterisk-burst for Claude, letter monograms for the long
tail). The component API is good. Only the SVG paths inside each
"shape" branch need to swap to actual brand logos so the app feels
like it's identifying real products instead of approximating them.

DELIVERABLE
1. Add `simple-icons` to app/package.json (MIT-licensed monochrome
   SVG paths for thousands of brands), OR inline SVG path data
   directly. Pick the cleaner code path; document why in commit msg.
2. Source actual brand SVGs for these agents (priority order):
   - claude-code → Anthropic Claude (rounded asterisk-burst)
   - cursor → Cursor's geometric "C" / cursor mark
   - codex → OpenAI Codex (use OpenAI's spiral if Codex lacks own mark)
   - conductor → Conductor's logomark (parallel-strands "C")
   - chatgpt → OpenAI mark
   - aider, cline, windsurf → keep letter monogram if no clean SVG
3. Source actual brand SVGs for these terminal hosts:
   ghostty / iterm2 / terminal / warp / kitty / alacritty / vscode
   / zed / windsurf / cursor (as host).
4. Where official SVGs aren't readily available (Conductor, Aider,
   Cline are niche), fall back to existing letter monogram.
5. Color treatment: brand SVG goes through existing `agentColor()` /
   `hostToken().color`. Use silhouette as single-color fill; not the
   brand's official multi-color gradient (Vigil's color system stays
   its own).
6. Constraints: viewBox="0 0 24 24"; single-path or grouped silhouette
   only; renders cleanly at 12–16 px; existing tests should not assert
   on `d=` strings (they assert role/aria-label/color).
7. Visual verification: screenshot the rail with all known agents/hosts
   visible. Save to docs/superpowers/screenshots/real-brand-logos.png.

CONSTRAINTS
- Do NOT change AgentGlyph / HostGlyph component API. Drop-in SVG
  replacement only.
- Do NOT introduce per-agent color overrides — use existing
  agentColor mapping.
- Do NOT add raster image deps (no PNG, no JPEG).
- Each inlined path includes a comment citing the source
  (simple-icons name, upstream repo path, or "freehand from
  official mark").

DEFINITION OF DONE
- App tests still 125+ green, tsc clean, cargo check OK
- ./dev.sh ~/conductor; rail shows recognizable real-brand silhouettes
  for at least Claude / Cursor / VS Code / Zed / Warp / Ghostty
- Screenshot saved
- Branch pushed; do NOT merge to main
```

## Known limitations carried forward

- **Decoder for `-` in real paths.** `decode_cwd_from_jsonl_path` in
  `daemon/src/sessionlog.rs` round-trips paths with `-` segments
  incorrectly (`/Users/costa/repos/abu-dhabi/vigil` →
  `/Users/costa/repos/abu/dhabi/vigil`). Acceptable for V3 — session
  still surfaces; just `repo_path` display is slightly off. Affects
  Costa's own `abu-dhabi/` Conductor workspace among others. Real fix
  needs Claude Code's exact encoding rules (probably `/` → `-` plus
  some escape for literal `-`); deferred.
- **Vibrancy.** `window-vibrancy` crate is in Cargo.toml but unused.
  HudWindow attempt ghosted (commit 4f53b69 reverted in f26faec).
  Agent 2 documented the safe opt-in path:
  `apply_vibrancy(&window, UnderWindowBackground,
   Some(FollowsWindowActiveState), None)` plus `transparent: true`
  in tauri.conf.json. Needs visual verification on a real desktop.

## User preferences observed (V2 / V3 work)

- **Authentic brand logos > geometric stand-ins.** User has flagged
  this 3+ times. Real-logos pass (Agent 4) is non-negotiable when
  slot frees up.
- **Clean and intuitive over feature-dense.** "Make all 3 panes
  actually work and keep them simple and understandable." Reduce
  chrome aggressively before adding features.
- **Real product feel.** "It's just all ugly, integrate liquid glass
  or something clean please." Reach for native macOS material when
  it doesn't ghost.
- **Cross-project visibility is core.** Vigil is "the control plane
  for coding agents — monitor every AI agent on your machine."
  Watching only one project is not enough.

## Per-terminal `/clear` strategy

- Agent 1 + 2 terminals: clear directly. Their work is on main.
- Agent 3 terminal: have the agent first commit a memo capturing its
  branch state, then clear. Resume prompt re-points at the memo.
  Format documented in the prior orchestrator turn.
- Orchestrator (this session): clearing now. Resume prompt below.

## Resume prompt for orchestrator

After clearing, paste:

```
Resume Vigil V3 orchestration. Read this file for the full state:
docs/superpowers/specs/2026-05-01-v3-orchestration-state.md

It documents: agent statuses + branches, Agent 3's design decisions
(Q1–Q5), the Agent 4 brand-logos prompt to dispatch, known
limitations, and user preferences. Pick up from there.

Don't redo decisions already made. Wait for Conductor agents to
surface questions or completion reports unless I say otherwise.
```
