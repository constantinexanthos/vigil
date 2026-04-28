# Vigil V1.5 — Cursor + Codex data sources

**Status:** proposed
**Date:** 2026-04-22
**Author:** Costa Xanthos (design) + Claude (draft)
**Follows:** `2026-04-16-vigil-dashboard-redesign-design.md`

---

## 1. TL;DR

V1 shipped the three-pane live dashboard but only one data source: Claude Code / Conductor JSONL (`~/.claude/projects/**/*.jsonl`). Sessions launched inside Cursor or Codex never appear in the left rail. V1.5 adds those two sources behind the same `SessionTurnRecord` contract the daemon already uses, plus a Codex summary backend so users who only have `codex` on `$PATH` still get plain-English "what's happening" text. State persistence (selected session, pane widths) is already wired via zustand `persist` — the spec's earlier "V1.5 state persistence" item collapses to one small tab-memory carry-over.

---

## 2. Why now

- The left rail says "Active now" but Cursor and Codex sessions are invisible. Early users who run Cursor *and* Claude Code side-by-side see half the picture.
- `summarizer::SummaryBackend::Codex` already exists as a variant but the `match` arm returns `"codex backend not yet wired"`. Dead-code warning in cargo is a daily reminder.
- The integration surface for new sources is small — `sessionlog.rs` is already structured around a tailer emitting `SessionTurn` records. Two more sources fit alongside it without a framework refactor.
- These two tracks are fully independent — ideal for parallel Conductor/agent dispatch.

---

## 3. Shape of the change

Two new daemon modules, one schema tweak, one summarizer fn, one tiny frontend addition. No new Tauri commands — the left rail lights up through the existing `get_live_sessions` pipeline once the daemon emits into it.

| Piece | Location | Kind |
|-------|----------|------|
| `CursorLogSource` | `daemon/src/cursorlog.rs` (new) | parser + tailer |
| `CodexLogSource` | `daemon/src/codexlog.rs` (new) | parser + tailer |
| `SessionTurnRecord.source` | `daemon/src/store.rs` | new column (`"claude" \| "cursor" \| "codex"`) |
| `run_codex` summarizer | `daemon/src/summarizer.rs` | new fn, wires the existing `Codex` variant |
| RightRail tab memory | `app/src/store/selection.ts` | extend persisted state |

The watch loop in `cli::run_watch` starts all three tailers side-by-side; each emits into the same unbounded channel; the consumer branches on `source` only where parsing detail differs (tool names vs. plain tool-call inference).

---

## 4. Cursor source

### 4.1 Log location (macOS)

```
~/Library/Application Support/Cursor/logs/<ts>/window<N>/exthost/output_logging_<ts>_Cursor Agent/1-Cursor Agent.log
```

Per-window, per-launch directory. Multiple directories appear simultaneously when Cursor runs multiple windows. Cursor rotates logs on each launch, so `watch` must re-scan the `logs/` root when new timestamp directories appear.

### 4.2 Parse strategy

Plaintext, line-oriented, with `[timestamp] [level] ` prefixes. Two event types matter:

- **User prompt lines** — `[INFO] composer-mode user message: <text>` (or equivalent — the exact prefix is confirmed against a sample at implementation time).
- **Agent response lines** — `[INFO] agent chunk: <text>` or the final assembled message per turn.

Tool calls in Cursor's log are named inline (`"Tool: edit_file"` / `"Tool: run_terminal_cmd"`), feeding `SessionTurn.tool_names`.

Session ID: synthesize as `cursor:<windowN>:<launch-ts>`. Stable for the life of the Cursor window.

### 4.3 Fallback — SQLite (V1.5.1 stretch)

`~/Library/Application Support/Cursor/User/workspaceStorage/**/state.vscdb` holds richer structured session data but requires opening a WAL SQLite file that Cursor has open. Use `rusqlite::Connection::open_with_flags` with `SQLITE_OPEN_READ_ONLY | SQLITE_OPEN_NO_MUTEX` plus immutable hint. Poll every 15s. **Only if the plaintext parser proves insufficient — do not build both upfront.**

### 4.4 Model inference

Cursor's agent log doesn't always record the model. Check for `"model": "<name>"` hints in the log text. If absent, set `SessionGroup.model = null` and let the UI show a dash.

---

## 5. Codex source

### 5.1 Log location

Exact path confirmed during implementation. Likely candidates (probe in order):

1. `~/.codex/sessions/<id>/transcript.jsonl` — JSONL per session if Codex follows the Claude convention
2. `~/.codex/history.json` or `~/.codex/log/*.log` — single-file or rotating plaintext
3. The `CODEX_LOG_DIR` environment variable if set

**Decision rule:** whichever candidate exists on a dev machine when the implementation agent starts; encoded as one-line probe in `codexlog::discover_root()` with fallback to `None` and a log warning.

### 5.2 Parse strategy

If JSONL, reuse `sessionlog::parse_line` with a Codex-specific `condense` (keys likely differ: `"role" / "content"` vs Claude's `"message": { "role", "content" }`). If plaintext, mirror the Cursor parser.

Session ID: from the JSONL file stem (like Claude) or synthesize `codex:<file-stem>` for plaintext.

### 5.3 Tool-call fidelity

Lowest of the three sources. Good enough: emit `SessionTurn` with empty `tool_names` if the source doesn't surface them. Summaries will lean more on file diffs.

---

## 6. Generalization: `SessionTurnRecord.source`

Add `source: String` (`"claude"` | `"cursor"` | `"codex"`) to `SessionTurnRecord` and the SQLite table. One migration:

```sql
ALTER TABLE session_turns ADD COLUMN source TEXT NOT NULL DEFAULT 'claude';
CREATE INDEX IF NOT EXISTS idx_turns_source ON session_turns(source);
```

Downstream effects are narrow: `summarizer::build_prompt` is source-agnostic today (operates on `SessionTurnRecord`), so it keeps working unchanged. The UI does not need to know about `source` — host kind already covers user-visible differentiation.

---

## 7. Codex summarizer backend

`summarizer.rs` adds `run_codex(prompt, system)` that shells out:

```
codex exec -p <prompt> --system-prompt <system> --model <fast-model> --output-format text
```

Exact flags confirmed at implementation time (`codex --help`). Same 20-second timeout, same `SummaryError` variants.

`detect_backend` ordering stays Claude-preferred; Codex is used only when `claude --version` fails. No user toggle in V1.5 — a settings-level switch is V2+.

---

## 8. Frontend: minimal

Persistence extension (one line of state):

```ts
// app/src/store/selection.ts
rightTab: "changes" | "checks" | "review" | "all",
setRightTab: (t) => set({ rightTab: t }),
```

Wire it into `RightRail.tsx`'s tab state. Keeps the user's last tab across reloads. No other UI work is in scope for V1.5 — the left rail lights up automatically once the daemon emits Cursor / Codex sessions.

---

## 9. Testing

Per-source unit tests in the Rust daemon, mirroring `sessionlog.rs`'s test pattern:

- `cursorlog::tests::parses_user_and_agent_lines`
- `cursorlog::tests::session_id_stable_per_window`
- `cursorlog::tests::handles_log_rotation`
- `codexlog::tests::jsonl_path_detects_transcript_shape`
- `codexlog::tests::plaintext_path_detects_role_prefix`
- `codexlog::tests::unknown_layout_returns_none`
- `summarizer::tests::run_codex_errors_cleanly_when_binary_missing`

Integration: a small shell fixture under `daemon/tests/fixtures/cursor/` and `daemon/tests/fixtures/codex/` with one captured real log tail each.

No frontend test additions — the existing `enrichSessionsWithLiveData` tests cover the merge path; Cursor/Codex sessions flow through the same `LiveSessionRow` contract.

---

## 10. Component boundaries

| Component | Input | Output | Depends on |
|-----------|-------|--------|-----------|
| `CursorLogSource` | `~/Library/.../Cursor/logs` | `TailerEvent` stream (`source = "cursor"`) | `notify` |
| `CodexLogSource` | discovered Codex root | `TailerEvent` stream (`source = "codex"`) | `notify` + probe fn |
| `summarizer::run_codex` | prompt + system string | summary text | `codex` CLI on `$PATH` |
| RightRail tab store slice | tab id | persisted tab id | zustand `persist` |

Each unit is independently implementable and testable. Cursor and Codex modules share no code beyond the existing `start_tailer` helper and the `SessionTurnRecord` shape.

---

## 11. Risks & open questions

- **Cursor log format drift.** Cursor has changed log layout at least once in 2025. Mitigation: parser returns `None` on unknown shapes, daemon logs a warning, session shows as "Cursor · Unknown turn" in the activity stream rather than crashing. No panic paths.
- **Codex log path uncertainty.** Resolved at implementation time — if no candidate matches, Codex source is a no-op and the daemon still runs. Log a single-line warning: `vigil: codex log directory not found; codex sessions will not be captured`.
- **Multiple Cursor windows.** Each window has its own log dir. Tailer watches `logs/` recursively; session IDs distinguish by window number in the path. No state-shared-across-windows assumption.
- **Transcript privacy.** Cursor logs contain full user prompts. Carries the same local-first guarantee as Claude JSONL — flagged once in the existing onboarding copy, no new modal. Summaries still respect the user's existing Keychain `allow-summary-engine-to-send-session-text` flag from V1.
- **Cross-source host attribution.** If Cursor launches a Claude Code session via integrated terminal, the JSONL tailer captures it AND the Cursor log tailer captures part of it. De-duplication is not in scope — both appear; each carries its own `host_kind` (the JSONL one reads `cursor` via process-tree walk). Acceptable in V1.5; re-evaluate if it's noisy in real use.

---

## 12. Scope

### 12.1 V1.5 (this spec)

- `cursorlog.rs` with plaintext parser + tailer
- `codexlog.rs` with JSONL-first / plaintext-fallback parser + tailer
- `SessionTurnRecord.source` column + migration
- `summarizer::run_codex` wiring of the `SummaryBackend::Codex` arm
- RightRail tab persistence (one zustand slice)
- Unit tests per source

### 12.2 V1.5.1 (carry-over, only if needed)

- Cursor SQLite (`state.vscdb`) fallback parser

### 12.3 Out of scope

- Aider / Cline / Claude Squad sources (V2+)
- OpenTelemetry OTLP receiver (POSITIONING Phase 2, not here)
- Settings UI for backend switching (V2+)
- Right-rail tab content (Wave 2 / Wave 3)
