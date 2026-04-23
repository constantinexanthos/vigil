# Vigil V2b — Live Right-Rail Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the right-rail's `All files` and `Review` tabs with real live content from existing daemon data; replace the blunt "not wired yet" message on `Checks` with a clearer "coming in V2c" placeholder that explains what will live there.

**Architecture:** Additive. One new Tauri command (`get_review_signals`) that reads the existing SQLite state on the Tauri-side `Store` wrapper, plus four new frontend components (`AllFilesPanel`, `ReviewPanel`, `ConfidenceDonut`, `ChecksPlaceholder`) composed through `RightRail`. No daemon Rust changes. The V2 spec's full Checks implementation (Bash tool-call parsing + GitHub Actions sync + hallucination scanner wiring) is deferred to a V2c plan because it requires preserving tool-use argument content that the current V1.5 JSONL tailer drops.

**Tech Stack:** Rust (rusqlite), TypeScript (React 19, Vitest), Tauri 2.

---

## Dependency graph

```
Task 1 (get_review_signals Tauri command + types + polling)
   │
   ├─ Task 2 (AllFilesPanel)           — uses existing session.files, no T1 dep
   ├─ Task 3 (ConfidenceDonut)         — pure render, no deps
   │          │
   │          └─ Task 4 (ReviewPanel)  — uses ConfidenceDonut + T1 data
   │
   └─ Task 5 (RightRail integration + tab badges + Checks placeholder)
```

Inside the subagent flow all tasks run sequentially. T2 and T3 could technically parallelize but the skill forbids parallel implementer dispatch.

---

## Files touched

**Create:**
- `app/src/components/AllFilesPanel.tsx`
- `app/src/components/ReviewPanel.tsx`
- `app/src/components/ConfidenceDonut.tsx`
- `app/src/components/ChecksPlaceholder.tsx`
- `app/src/__tests__/all-files-panel.test.tsx`
- `app/src/__tests__/review-panel.test.tsx`
- `app/src/__tests__/confidence-donut.test.tsx`

**Modify:**
- `app/src-tauri/src/store.rs` — add `query_session_review(session_id)` returning a new `ReviewSignalsRow`
- `app/src-tauri/src/commands.rs` — add `get_review_signals` command
- `app/src-tauri/src/main.rs` — register the new command
- `app/src/types.ts` — add `ReviewSignals` interface
- `app/src/hooks.ts` — poll `get_review_signals` when a session is selected; expose `reviewSignals` on `DaemonState`
- `app/src/components/layout/RightRail.tsx` — render the three new panels, per-tab badges, remove the "not wired yet" text

---

### Task 1: `get_review_signals` Tauri command + polling

**Files:**
- Modify: `app/src-tauri/src/store.rs` — add `query_session_review`
- Modify: `app/src-tauri/src/commands.rs` — add command
- Modify: `app/src-tauri/src/main.rs` — register command
- Modify: `app/src/types.ts` — add `ReviewSignals` type
- Modify: `app/src/hooks.ts` — poll + expose

**Data shape returned:**

```ts
interface ReviewSignals {
  confidence: number;           // 0-100 heuristic
  confidence_reason: string;    // plain English
  file_count: number;
  has_tests: boolean;
  collisions: Array<{
    file_path: string;
    agents: string[];
  }>;
}
```

Confidence is the same simple heuristic already used by `query_live_summary` at `app/src-tauri/src/store.rs:712`: `file_count <= 5 → 85; file_count <= 15 → 70; else 50`. Cheap to compute, returns a useful number without coupling the Tauri crate to the daemon's `trust.rs`. Upgrading to the daemon's richer `ConfidenceReport` is a follow-up when trust logic lives in a shared crate.

- [ ] **Step 1: Add `query_session_review` on the Tauri store** — append to `app/src-tauri/src/store.rs` inside the existing `impl Store { ... }` block (right after `query_live_summary` ends at line 764):

```rust
    /// Session-scoped review signals: simple-heuristic confidence + reason +
    /// file_count + has_tests + per-session collisions. Shaped for the
    /// right-rail Review tab.
    pub fn query_session_review(&self, session_id: &str) -> Result<ReviewSignalsRow> {
        let mut file_stmt = self.conn.prepare(
            "SELECT DISTINCT file_path FROM events \
             WHERE session_id = ?1 AND file_path IS NOT NULL \
               AND kind IN ('file_create', 'file_modify')",
        )?;
        let files: Vec<String> = file_stmt
            .query_map(params![session_id], |row| row.get::<_, String>(0))?
            .filter_map(Result::ok)
            .collect();
        let file_count = files.len() as u32;

        let has_tests = files.iter().any(|f| {
            let lower = f.to_lowercase();
            lower.contains("test") || lower.contains("spec")
                || lower.ends_with(".test.ts") || lower.ends_with(".test.tsx")
                || lower.ends_with("_test.rs") || lower.ends_with("_test.go")
                || lower.ends_with("_test.py")
        });

        let (confidence, confidence_reason) = if file_count == 0 {
            (50, "No files changed yet.".to_string())
        } else if file_count <= 5 {
            (85, format!("Small focused change — {file_count} file(s) touched."))
        } else if file_count <= 15 {
            (70, format!("Medium scope — {file_count} files touched."))
        } else {
            (50, format!("Large change — {file_count} files touched. Harder to review."))
        };

        // Per-session collisions: files from this session that appear in the
        // global 5-minute collision window.
        let collisions_all = self.query_collisions()?;
        let this_files: std::collections::HashSet<&str> = files.iter().map(String::as_str).collect();
        let collisions: Vec<CollisionRow> = collisions_all
            .into_iter()
            .filter(|c| this_files.contains(c.file_path.as_str()))
            .collect();

        Ok(ReviewSignalsRow {
            confidence,
            confidence_reason,
            file_count,
            has_tests,
            collisions,
        })
    }
```

And add the struct definition at the bottom of the file alongside the other `*Row` types:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct ReviewSignalsRow {
    pub confidence: u32,
    pub confidence_reason: String,
    pub file_count: u32,
    pub has_tests: bool,
    pub collisions: Vec<CollisionRow>,
}
```

- [ ] **Step 2: Add the Tauri command** — append to `app/src-tauri/src/commands.rs`:

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_review_signals(session_id: String) -> Result<crate::store::ReviewSignalsRow, String> {
    let store = open_store()?;
    store
        .query_session_review(&session_id)
        .map_err(|e| format!("Query failed: {e}"))
}
```

Add the import at the top of the file (extend the existing `use crate::store::{...}`):

```rust
use crate::store::{
    default_db_path, AgentStatRow, CollisionRow, CommitGroup, CostTotalRow, EventRow, HostRow,
    LiveSessionRow, LiveSummaryRow, PrRow, ReviewSignalsRow, Store, WorkspaceSummaryRow,
};
```

(Adding `ReviewSignalsRow` to that `use` group lets the `Result<ReviewSignalsRow, String>` return type resolve without the `crate::store::` prefix if you prefer — the prefix form in the function above also works, pick whichever you like.)

- [ ] **Step 3: Register the command** — in `app/src-tauri/src/main.rs`, add `commands::get_review_signals` to the `invoke_handler!` list.

- [ ] **Step 4: Verify Tauri backend compiles**

Run: `cd app/src-tauri && cargo check 2>&1 | grep -E "^error" || echo OK`
Expected: `OK`.

- [ ] **Step 5: Add `ReviewSignals` type to frontend** — in `app/src/types.ts`, after the `SessionTurn` interface:

```ts
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
```

- [ ] **Step 6: Poll in `useDaemonData`** — in `app/src/hooks.ts`:

a) Add to the types import group at the top:

```ts
import type {
  // ... existing imports
  ReviewSignals,
} from "./types";
```

b) Extend `DaemonState`:

```ts
  /** Review signals for the currently-selected session (confidence / collisions / test-presence). Null when no session or fetch failed. */
  reviewSignals: ReviewSignals | null;
```

c) Add state hook near the other `useState`s (after `setRecentTurns`):

```ts
  const [reviewSignals, setReviewSignals] = useState<ReviewSignals | null>(null);
```

d) In the `Promise.all` inside `fetchAll`, append another parallel fetch (after the `get_recent_turns` one):

```ts
        activeSessionId
          ? invoke<ReviewSignals | null>("get_review_signals", { sessionId: activeSessionId }).catch(() => null)
          : Promise.resolve(null),
```

e) Update the tuple destructuring to receive it (new last element):

```ts
      const [evts, agents, cols, stats, count, cost, commits, summary, hostRows, liveRows, cliStatus, sessionSummary, turnsResult, reviewResult] = await Promise.all([...]);
```

f) After the other setters, add:

```ts
      setReviewSignals(reviewResult);
```

g) In the demo-mode fallback branch, set:

```ts
          setReviewSignals(null);
```

h) Include `reviewSignals` in the returned object at the bottom.

- [ ] **Step 7: Typecheck + tests**

Run: `cd app && npx tsc --noEmit && npm test -- --run`
Expected: clean, 92 tests pass (no new tests in this task).

- [ ] **Step 8: Commit**

```bash
git add app/src-tauri/src/store.rs app/src-tauri/src/commands.rs app/src-tauri/src/main.rs app/src/types.ts app/src/hooks.ts
git commit -m "$(cat <<'EOF'
feat(tauri): get_review_signals command + frontend polling

Session-scoped simple-heuristic confidence + per-session collisions +
test presence flag. Uses the same 85/70/50 file-count bucketing already
used by query_live_summary so there's no new logic to test. Upgrading
to the daemon's richer trust::ConfidenceReport is a follow-up for when
trust lives in a shared crate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `AllFilesPanel` component

**Files:**
- Create: `app/src/components/AllFilesPanel.tsx`
- Create: `app/src/__tests__/all-files-panel.test.tsx`

**Data source:** uses the existing `session.files` field on `SessionGroup` (populated by `groupEventsIntoSessions` in `types.ts`). No new Tauri call needed — this tab is a richer view over data the Changes tab already uses.

Difference from Changes: `All files` sorts by total-lines-changed descending (most impacted first) and shows a cumulative diff stat per file. Changes shows files in insertion order. Conceptually, "Changes" answers "what's currently uncommitted," and "All files" answers "what did this session touch overall." For V2b, both draw from the same `session.files` array — a future upgrade distinguishes committed vs uncommitted once the daemon tracks git state per file.

- [ ] **Step 1: Write failing tests** — create `app/src/__tests__/all-files-panel.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllFilesPanel } from "../components/AllFilesPanel";
import type { SessionFile } from "../types";

function file(partial: Partial<SessionFile>): SessionFile {
  return { path: "x.ts", kind: "file_modify", diff: null, added: 0, removed: 0, ...partial };
}

describe("AllFilesPanel", () => {
  it("renders an empty state when no files", () => {
    render(<AllFilesPanel files={[]} />);
    expect(screen.getByText(/no files touched yet/i)).toBeInTheDocument();
  });

  it("renders one row per file", () => {
    const files: SessionFile[] = [
      file({ path: "src/a.ts", added: 3, removed: 1 }),
      file({ path: "src/b.ts", added: 10, removed: 0 }),
    ];
    render(<AllFilesPanel files={files} />);
    expect(screen.getByText(/src\/a\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/src\/b\.ts/)).toBeInTheDocument();
  });

  it("sorts by total lines changed descending", () => {
    const files: SessionFile[] = [
      file({ path: "small.ts", added: 1, removed: 0 }),
      file({ path: "big.ts", added: 50, removed: 10 }),
      file({ path: "medium.ts", added: 5, removed: 5 }),
    ];
    render(<AllFilesPanel files={files} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("big.ts");
    expect(rows[1]).toHaveTextContent("medium.ts");
    expect(rows[2]).toHaveTextContent("small.ts");
  });

  it("shows +/- diff stats per file", () => {
    render(<AllFilesPanel files={[file({ path: "x.ts", added: 12, removed: 3 })]} />);
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- --run all-files-panel`
Expected: fail — module not found.

- [ ] **Step 3: Implement** — `app/src/components/AllFilesPanel.tsx`:

```tsx
import type { SessionFile } from "../types";

interface Props {
  files: SessionFile[];
}

export function AllFilesPanel({ files }: Props) {
  if (files.length === 0) {
    return (
      <div className="px-4 py-5 text-[12px] text-white/45">
        No files touched yet.
      </div>
    );
  }

  const sorted = [...files].sort((a, b) => totalChanged(b) - totalChanged(a));

  return (
    <ul className="flex-1 overflow-y-auto px-4 py-3 space-y-1 list-none pl-0" role="list">
      {sorted.map((f) => (
        <li
          key={f.path}
          className="flex items-center gap-2 font-mono text-[11px] text-white/80 py-0.5"
          role="listitem"
        >
          <span className="flex-1 truncate">{f.path}</span>
          <span className="shrink-0 text-ok">+{f.added}</span>
          <span className="shrink-0 text-bad">-{f.removed}</span>
        </li>
      ))}
    </ul>
  );
}

function totalChanged(f: SessionFile): number {
  return (f.added || 0) + (f.removed || 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- --run all-files-panel`
Expected: 4 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/AllFilesPanel.tsx app/src/__tests__/all-files-panel.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): AllFilesPanel — session file rollup sorted by impact

Every file touched in the session, sorted by added+removed desc.
One row per path with +added / -removed stats. Empty state when
the session hasn't touched anything yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ConfidenceDonut` component

**Files:**
- Create: `app/src/components/ConfidenceDonut.tsx`
- Create: `app/src/__tests__/confidence-donut.test.tsx`

Pure rendering component. Takes a 0–100 score and renders a conic-gradient ring whose progress is the score, colored by threshold:
- ≥75 → `ok` (green)
- 50–74 → `warn` (amber)
- <50 → `bad` (red)

- [ ] **Step 1: Write failing tests**

```tsx
// app/src/__tests__/confidence-donut.test.tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceDonut } from "../components/ConfidenceDonut";

describe("ConfidenceDonut", () => {
  it("renders the score as the center text", () => {
    render(<ConfidenceDonut score={76} />);
    expect(screen.getByText("76")).toBeInTheDocument();
  });

  it("uses green for scores >= 75", () => {
    const { container } = render(<ConfidenceDonut score={85} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("style")).toContain("rgb(74, 222, 128)");
  });

  it("uses amber for scores 50-74", () => {
    const { container } = render(<ConfidenceDonut score={65} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("style")).toContain("rgb(251, 191, 36)");
  });

  it("uses red for scores < 50", () => {
    const { container } = render(<ConfidenceDonut score={30} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("style")).toContain("rgb(239, 68, 68)");
  });

  it("clamps score to 0-100", () => {
    render(<ConfidenceDonut score={-10} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    render(<ConfidenceDonut score={150} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd app && npm test -- --run confidence-donut`
Expected: fail — module not found.

- [ ] **Step 3: Implement** — `app/src/components/ConfidenceDonut.tsx`:

```tsx
interface Props {
  score: number;
  size?: number; // diameter in px
}

export function ConfidenceDonut({ score, size = 52 }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = clamped >= 75 ? "#4ade80" : clamped >= 50 ? "#fbbf24" : "#ef4444";
  const inner = size - 14;

  return (
    <div
      data-ring
      className="relative flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(${color} 0 ${clamped}%, rgba(255,255,255,0.08) ${clamped}% 100%)`,
      }}
    >
      <div
        className="flex items-center justify-center bg-[#0e0e10] text-white font-semibold tabular-nums"
        style={{ width: inner, height: inner, borderRadius: "50%", fontSize: "14px" }}
      >
        {clamped}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app && npm test -- --run confidence-donut`
Expected: 5 tests pass (note the last test renders twice in one `it` and asserts both — jsdom creates separate DOM trees per render so `screen.getByText` works).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ConfidenceDonut.tsx app/src/__tests__/confidence-donut.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): ConfidenceDonut component

Conic-gradient ring with the score as the center text. Color
thresholds: >=75 green, >=50 amber, <50 red. Clamps to 0-100.
Pure render — no effects, no state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `ReviewPanel` component

**Files:**
- Create: `app/src/components/ReviewPanel.tsx`
- Create: `app/src/__tests__/review-panel.test.tsx`

Composes `ConfidenceDonut` + collision cards + a bottom "Checks OK" line summarizing positive signals.

- [ ] **Step 1: Write failing tests**

```tsx
// app/src/__tests__/review-panel.test.tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewPanel } from "../components/ReviewPanel";
import type { ReviewSignals } from "../types";

function signals(partial: Partial<ReviewSignals> = {}): ReviewSignals {
  return {
    confidence: 76,
    confidence_reason: "Small focused change — 3 file(s) touched.",
    file_count: 3,
    has_tests: true,
    collisions: [],
    ...partial,
  };
}

describe("ReviewPanel", () => {
  it("renders an analyzing state when signals are null", () => {
    render(<ReviewPanel signals={null} />);
    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it("renders confidence score + reason", () => {
    render(<ReviewPanel signals={signals({ confidence: 82, confidence_reason: "Small change." })} />);
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("Small change.")).toBeInTheDocument();
  });

  it("renders collision cards when present", () => {
    render(
      <ReviewPanel
        signals={signals({
          collisions: [
            { file_path: "src/auth.ts", agents: ["claude-code", "cursor"] },
          ],
        })}
      />,
    );
    expect(screen.getByText(/src\/auth\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/claude-code/)).toBeInTheDocument();
    expect(screen.getByText(/cursor/)).toBeInTheDocument();
  });

  it("shows a 'tests added' checkmark when has_tests is true", () => {
    render(<ReviewPanel signals={signals({ has_tests: true })} />);
    expect(screen.getByText(/tests added/i)).toBeInTheDocument();
  });

  it("omits the tests checkmark when has_tests is false", () => {
    render(<ReviewPanel signals={signals({ has_tests: false })} />);
    expect(screen.queryByText(/tests added/i)).not.toBeInTheDocument();
  });

  it("shows the file count", () => {
    render(<ReviewPanel signals={signals({ file_count: 7 })} />);
    expect(screen.getByText(/7 files/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- --run review-panel`
Expected: fail — module not found.

- [ ] **Step 3: Implement** — `app/src/components/ReviewPanel.tsx`:

```tsx
import { ConfidenceDonut } from "./ConfidenceDonut";
import type { ReviewSignals } from "../types";

interface Props {
  signals: ReviewSignals | null;
}

export function ReviewPanel({ signals }: Props) {
  if (!signals) {
    return (
      <div className="px-4 py-5 text-[12px] text-white/45">
        Analyzing…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex items-center gap-3 pb-3 border-b border-white/5 mb-3">
        <ConfidenceDonut score={signals.confidence} />
        <div className="min-w-0">
          <div className="text-[12px] text-white/85 font-semibold">Confidence</div>
          <div className="text-[11px] text-white/55 mt-0.5 leading-snug">
            {signals.confidence_reason}
          </div>
        </div>
      </div>

      {signals.collisions.length > 0 && (
        <div className="space-y-2 mb-3">
          {signals.collisions.map((c) => (
            <div
              key={c.file_path}
              className="bg-bad/8 border-l-2 border-bad rounded-sm px-3 py-2"
            >
              <div className="text-[11px] font-semibold text-red-200 flex items-center gap-1.5">
                <span aria-hidden>▲</span>
                <span>Collision · {c.agents.length} agents on <span className="font-mono">{c.file_path}</span></span>
              </div>
              <div className="text-[10.5px] text-white/55 mt-1 font-mono">
                Editors: {c.agents.join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-white/45 pt-2 border-t border-white/5 flex flex-wrap gap-x-3 gap-y-1">
        <span>{signals.file_count} files</span>
        {signals.has_tests && <span>✓ tests added</span>}
        {signals.collisions.length === 0 && <span>✓ no collisions</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- --run review-panel`
Expected: 6 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ReviewPanel.tsx app/src/__tests__/review-panel.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): ReviewPanel — confidence + collisions + positive signals

Composes ConfidenceDonut with the session's confidence score + reason,
renders collision cards for files also being edited by other agents,
and ends with a short positive-signal line (file count, tests added,
no collisions). Analyzing… placeholder when signals are null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire panels into `RightRail` + tab badges

**Files:**
- Create: `app/src/components/ChecksPlaceholder.tsx`
- Modify: `app/src/components/layout/RightRail.tsx`

- [ ] **Step 1: Create the Checks placeholder** — `app/src/components/ChecksPlaceholder.tsx`:

```tsx
export function ChecksPlaceholder() {
  return (
    <div className="px-4 py-5 text-[12px] text-white/55 leading-relaxed">
      <div className="text-label uppercase text-white/40 font-semibold mb-2">Coming in V2c</div>
      <p className="mb-2">
        Live test and CI status will land here — <code className="font-mono text-white/70">npm test</code> / <code className="font-mono text-white/70">cargo check</code> / <code className="font-mono text-white/70">tsc</code> runs captured as the agent fires them, plus a GitHub Actions section when a PR is open.
      </p>
      <p className="text-white/35 text-[11px]">
        Needs daemon work to preserve Bash tool-call arguments — not shipped yet.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `RightRail.tsx` to render the three panels**

Replace the current file with:

```tsx
import { useSelection, type RightTab } from "../../store/selection";
import { FilesPanel } from "../FilesPanel";
import { AllFilesPanel } from "../AllFilesPanel";
import { ReviewPanel } from "../ReviewPanel";
import { ChecksPlaceholder } from "../ChecksPlaceholder";
import type { SessionGroup, ReviewSignals } from "../../types";

type Tab = RightTab;

interface Props {
  session: SessionGroup | null;
  reviewSignals: ReviewSignals | null;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All files" },
  { id: "changes", label: "Changes" },
  { id: "checks", label: "Checks" },
  { id: "review", label: "Review" },
];

export function RightRail({ session, reviewSignals }: Props) {
  const tab = useSelection((s) => s.rightTab);
  const setTab = useSelection((s) => s.setRightTab);

  const allFilesCount = session ? session.files.length : 0;
  const changesCount = allFilesCount; // same underlying source in V2b
  const reviewSignalCount = reviewSignals?.collisions.length ?? 0;

  return (
    <aside
      className="h-full flex flex-col"
      style={{
        background: "rgba(18,18,20,0.75)",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <nav
        role="tablist"
        aria-label="Session details"
        className="px-4 py-3 border-b border-white/5 flex gap-4 text-[12px]"
      >
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            controls={`right-rail-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "all" && allFilesCount > 0 ? <span className="ml-1 text-white/35">{allFilesCount}</span> : null}
            {t.id === "changes" && changesCount > 0 ? <span className="ml-1 text-white/35">{changesCount}</span> : null}
            {t.id === "review" && reviewSignalCount > 0 ? (
              <span className="ml-1 inline-flex items-center justify-center bg-bad text-white text-[9px] rounded-full min-w-[14px] h-[14px] px-1">
                {reviewSignalCount}
              </span>
            ) : null}
          </TabButton>
        ))}
      </nav>

      {!session && (
        <div className="px-4 py-5 text-[12px] text-white/45">
          Select a session to see its changes.
        </div>
      )}

      {session && tab === "all" && (
        <div role="tabpanel" id="right-rail-panel-all" className="flex-1 flex flex-col overflow-hidden">
          <AllFilesPanel files={session.files} />
        </div>
      )}
      {session && tab === "changes" && (
        <div role="tabpanel" id="right-rail-panel-changes" className="flex-1 flex flex-col overflow-hidden">
          <FilesPanel files={session.files} />
        </div>
      )}
      {session && tab === "checks" && (
        <div role="tabpanel" id="right-rail-panel-checks" className="flex-1 overflow-y-auto">
          <ChecksPlaceholder />
        </div>
      )}
      {session && tab === "review" && (
        <div role="tabpanel" id="right-rail-panel-review" className="flex-1 flex flex-col overflow-hidden">
          <ReviewPanel signals={reviewSignals} />
        </div>
      )}

      <div className="border-t border-white/5 px-4 py-2.5 text-[11px] text-white/55 flex gap-3.5">
        <span>Setup</span>
        <span>Run</span>
        <span>Terminal</span>
        <span className="ml-auto text-white/30" aria-hidden>
          +
        </span>
      </div>
    </aside>
  );
}

function TabButton({
  active,
  controls,
  onClick,
  children,
}: {
  active: boolean;
  controls: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`pb-0.5 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40 ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75 hover:underline decoration-white/30 underline-offset-4"}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Pass `reviewSignals` through MiddlePane → App**

This is NOT needed — RightRail receives props directly from the top-level App.tsx, not through MiddlePane. Open `app/src/App.tsx` and find the `<RightRail session={...} />` element. Change it to:

```tsx
<RightRail session={selected} reviewSignals={data.reviewSignals} />
```

(If the App's RightRail call site routes through a different wrapper, adjust accordingly.)

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Run the full test suite**

Run: `cd app && npm test -- --run`
Expected: 92 baseline + 4 (AllFilesPanel) + 5 (ConfidenceDonut) + 6 (ReviewPanel) = **107** tests pass.

- [ ] **Step 6: Manual smoke (optional)** — start `./dev.sh`, select a session, click through the four tabs. All files shows the list; Changes still works; Checks shows the Coming-in-V2c copy; Review shows the confidence donut + any collisions.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/ChecksPlaceholder.tsx app/src/components/layout/RightRail.tsx app/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): wire AllFilesPanel + ReviewPanel + ChecksPlaceholder into RightRail

Replaces the "not wired yet" message with three real panels:
- All files · sorted by impact, session-wide file rollup
- Changes · unchanged from V1 (file list + diff drawer via FilesPanel)
- Checks · friendly placeholder explaining V2c scope
- Review · confidence donut + collision cards + positive-signal summary

Tab bar gains live counts: All files N, Changes N, Review (red pill for
any open collision). Selection persists via the zustand slice from V1.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- §3.3.1 All files → T2 ✓ (using `session.files`; edit-count rollup deferred)
- §3.3.2 Checks → **deferred to V2c** (ChecksPlaceholder in T5 explains the gap to users)
- §3.3.3 Review → T1 + T3 + T4 ✓ (confidence + collisions + has_tests; hallucination + silent-fallback deferred)

**Placeholder scan:** None. Every step has exact code or exact commands.

**Type consistency:**
- `ReviewSignals` defined in T1, used by T4 and T5.
- `ReviewSignalsRow` defined in T1 (Rust); `ReviewSignals` (TS) has the matching shape.
- `SessionFile` reused from existing `types.ts` — not redefined.

## Known deviations from the V2 spec

- **Checks tab is a placeholder in V2b.** The full spec called for `daemon/src/checks.rs` parsing Bash tool calls, a `check_runs` table, GitHub Actions sync, and more. Shipping that requires preserving tool-use argument content in the JSONL tailer (today's tailer drops it) plus new daemon schema and a GitHub API extension. That's ~8-10 tasks of its own — spinning it into V2c lets V2b ship the All files + Review wins fast. The placeholder tells users exactly what's coming.
- **Review confidence is a simple heuristic** (85/70/50 thresholds) rather than the richer `trust.rs::ConfidenceReport` with per-factor breakdowns. Upgrading is a follow-up when trust logic lives in a shared crate between daemon and Tauri. V2b's score lines up with what the rest of the app (`query_live_summary`) already shows, so the number is consistent.
- **No hallucination wiring.** The V2 spec called for wiring `hallucination.rs::scan_file` into the post-edit pass and surfacing phantom-import warnings in Review. Deferred along with Checks to V2c — same reason (daemon-side work beyond V2b's scope).
