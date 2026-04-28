# Vigil V2a — Summary Block + Model Indicator + Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three of the V2 spec's four workstreams — layered+timelined summary block, model indicator in rail+header, and a cross-cutting polish pass. V2b (the three live right-rail tabs) follows as a separate plan.

**Architecture:** Additive. New frontend components (`ModelChip`, `ModelPill`, `PulseLine`, `MilestoneFeed`) get composed into existing ones (`SessionRow`, `SessionHeader`, `SummaryBlock`). One new Tauri command `get_recent_turns` exposes data the daemon already persists. Tailwind config gains semantic tokens without clobbering existing ones. No daemon Rust changes beyond the one Tauri command.

**Tech Stack:** Rust (rusqlite, serde), React 19, Zustand 5, Tailwind CSS, Framer Motion, Vitest, Tauri 2.

---

## Dependency graph

```
Task 1 (Tailwind foundation)
   │
   ├─ Track M: Model          (T2 → T3 → T4 → T5)
   │      ├─ T2 model-tokens.ts
   │      ├─ T3 ModelChip + SessionRow
   │      ├─ T4 ModelPill + SessionHeader
   │      └─ T5 SessionFooter cleanup
   │
   ├─ Track S: Summary        (T6,T7,T8 parallel → T9 → T10)
   │      ├─ T6 tool-verbs.ts
   │      ├─ T7 PulseLine
   │      ├─ T8 get_recent_turns (Tauri)
   │      ├─ T9 MilestoneFeed
   │      └─ T10 Rewire SummaryBlock
   │
   └─ Track P: Polish         (T11,T12,T13 parallel)
          ├─ T11 Motion rhythm
          ├─ T12 Empty/loading/error
          └─ T13 Hover/focus
```

After T1 the three tracks are independent. Inside each track tasks are sequential. Subagent-driven execution runs them in order; reviews happen after T5, T10, and T13 (track boundaries).

---

## Files touched

**Create:**
- `app/src/lib/model-tokens.ts`
- `app/src/lib/tool-verbs.ts`
- `app/src/components/ModelChip.tsx`
- `app/src/components/ModelPill.tsx`
- `app/src/components/PulseLine.tsx`
- `app/src/components/MilestoneFeed.tsx`
- `app/src/__tests__/model-tokens.test.ts`
- `app/src/__tests__/tool-verbs.test.ts`
- `app/src/__tests__/pulse-line.test.tsx`
- `app/src/__tests__/milestone-feed.test.tsx`

**Modify:**
- `app/tailwind.config.js` — add semantic tokens + pulse-alive keyframe
- `app/src/components/SessionRow.tsx` — swap inline model text for `<ModelChip>`
- `app/src/components/SessionHeader.tsx` — add `<ModelPill>` next to RUNNING badge
- `app/src/components/SessionFooter.tsx` — drop model segment
- `app/src/components/SummaryBlock.tsx` — compose paragraph + PulseLine + MilestoneFeed
- `app/src/hooks.ts` — poll `get_recent_turns` per selected session
- `app/src/types.ts` — export `SessionTurn` type for frontend consumption
- `app/src-tauri/src/commands.rs` — new `get_recent_turns` Tauri command
- `app/src-tauri/src/main.rs` — register the new command
- `app/src/components/layout/LeftRail.tsx` — apply hover polish (T13)
- `app/src/components/layout/RightRail.tsx` — apply hover polish on tabs (T13)
- `app/src/components/layout/MiddlePane.tsx` — apply empty-state polish (T12)
- `app/src/App.tsx` — apply disconnected-banner polish (T12)

---

### Task 1: Extend Tailwind config with semantic tokens

**Files:**
- Modify: `app/tailwind.config.js`

Add semantic color tokens, transition durations, and a shared `pulse-alive` keyframe. Existing keys stay untouched so current code continues to compile.

- [ ] **Step 1: Open `app/tailwind.config.js` and replace it with**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#1C1C1E", secondary: "#2C2C2E", tertiary: "#3A3A3C", elevated: "#48484A" },
        text: { primary: "#F9FAFB", secondary: "#D1D5DB", tertiary: "#9CA3AF", muted: "#6B7280" },
        border: { DEFAULT: "rgba(255,255,255,0.06)", strong: "rgba(255,255,255,0.1)" },
        accent: "#3B82F6",
        green: "#15803D",
        amber: "#D97706",
        red: "#B91C1C",
        purple: "#7C3AED",
        // V2a semantic tokens — new names, don't clobber the older ones above.
        ok: "#4ade80",
        warn: "#fbbf24",
        bad: "#ef4444",
        info: "#60a5fa",
        claudefam: "#a78bfa",
        gptfam: "#f472b6",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", "system-ui", "sans-serif"],
        mono: ['"SF Mono"', '"JetBrains Mono"', '"IBM Plex Mono"', "Menlo", "monospace"],
      },
      fontSize: {
        xs: "11px", sm: "12px", base: "13px", lg: "14px", xl: "16px",
        // V2a scale
        label: ["9px", { letterSpacing: "0.08em" }],
        stat: ["10px", { lineHeight: "1.5" }],
        feed: ["11.5px", { lineHeight: "1.8" }],
        title: ["14px", { lineHeight: "1.3", fontWeight: "600" }],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px" },
      boxShadow: {
        subtle: "0 0 0 0.5px rgba(0,0,0,0.1)",
        card: "0 0 0 0.5px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        elevated: "0 0 0 0.5px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)",
      },
      transitionDuration: { fast: "120ms", base: "180ms", slow: "400ms" },
      transitionTimingFunction: {
        "spring-overshoot": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "pulse-alive": {
          "0%,100%": { opacity: "0.6" },
          "50%":     { opacity: "1"   },
        },
      },
      animation: {
        "pulse-alive": "pulse-alive 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

- [ ] **Step 2: Verify Tailwind still compiles**

Run: `cd app && npm run typecheck 2>&1 | tail -5`
Expected: no errors. Tailwind is PostCSS-processed, not TypeScript-checked, but typecheck validates the TS build still works.

Then:
Run: `cd app && npx vite build 2>&1 | tail -3`
Expected: build succeeds. If Tailwind rejects the config, Vite surfaces the error here.

- [ ] **Step 3: Commit**

```bash
git add app/tailwind.config.js
git commit -m "$(cat <<'EOF'
feat(frontend): add semantic tokens and pulse-alive keyframe to Tailwind

V2a foundation. Adds ok/warn/bad/info semantic colors, claudefam/gptfam
model family colors, label/stat/feed/title font sizes, fast/base/slow
transition durations, spring-overshoot easing, and a shared
pulse-alive keyframe. All additive — existing classes untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `model-tokens.ts` — model name/color helpers

**Files:**
- Create: `app/src/lib/model-tokens.ts`
- Create: `app/src/__tests__/model-tokens.test.ts`

- [ ] **Step 1: Write failing tests** — create `app/src/__tests__/model-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { modelShortName, modelLongName, modelFamilyColor } from "../lib/model-tokens";

describe("modelShortName", () => {
  it("returns em dash for null / empty", () => {
    expect(modelShortName(null)).toBe("—");
    expect(modelShortName("")).toBe("—");
  });
  it("maps Claude family names", () => {
    expect(modelShortName("claude-opus-4-7-20260501")).toBe("OPUS");
    expect(modelShortName("claude-sonnet-4-6")).toBe("SONNET");
    expect(modelShortName("claude-haiku-4-5")).toBe("HAIKU");
  });
  it("maps OpenAI family names", () => {
    expect(modelShortName("gpt-5")).toBe("GPT-5");
    expect(modelShortName("gpt-5-codex")).toBe("GPT-5");
    expect(modelShortName("gpt-4o")).toBe("GPT-4");
    expect(modelShortName("codex")).toBe("CODEX");
  });
  it("falls back to MODEL for unknown strings", () => {
    expect(modelShortName("llama-3")).toBe("MODEL");
  });
});

describe("modelLongName", () => {
  it("returns 'Unknown' for null / empty", () => {
    expect(modelLongName(null)).toBe("Unknown");
    expect(modelLongName("")).toBe("Unknown");
  });
  it("pretty-prints Claude model ids", () => {
    expect(modelLongName("claude-opus-4-7-20260501")).toBe("Claude Opus 4.7");
    expect(modelLongName("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6");
    expect(modelLongName("claude-haiku-4-5-20260101")).toBe("Claude Haiku 4.5");
  });
  it("handles GPT names", () => {
    expect(modelLongName("gpt-5")).toBe("GPT-5");
    expect(modelLongName("gpt-5-codex")).toBe("GPT-5 CODEX");
    expect(modelLongName("codex")).toBe("CODEX");
  });
  it("passes through unknown strings", () => {
    expect(modelLongName("llama-3")).toBe("llama-3");
  });
});

describe("modelFamilyColor", () => {
  it("returns claude lavender for Claude family", () => {
    expect(modelFamilyColor("claude-opus-4-7")).toBe("#a78bfa");
    expect(modelFamilyColor("claude-sonnet-4-6")).toBe("#a78bfa");
  });
  it("returns gpt pink for OpenAI family", () => {
    expect(modelFamilyColor("gpt-5")).toBe("#f472b6");
    expect(modelFamilyColor("codex")).toBe("#f472b6");
  });
  it("returns neutral gray for null / unknown", () => {
    expect(modelFamilyColor(null)).toBe("#6b7084");
    expect(modelFamilyColor("llama-3")).toBe("#6b7084");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- --run model-tokens`
Expected: fail — module not found.

- [ ] **Step 3: Implement** — create `app/src/lib/model-tokens.ts`:

```ts
/**
 * Model name → display tokens. Separate from `formatters.ts::shortModel` because
 * V2a wants uppercase-short (OPUS / GPT-5) plus a family color, and the older
 * helper returns a mixed-case ("Opus") / no-color variant that other surfaces still use.
 */

export function modelShortName(model: string | null | undefined): string {
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

export function modelLongName(model: string | null | undefined): string {
  if (!model) return "Unknown";
  const m = model.toLowerCase();
  // Strip date suffix like "-20260501" from Claude model ids.
  const stripped = m.replace(/-\d{8}$/, "");
  const claude = stripped.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) {
    const [, family, major, minor] = claude;
    const pretty = family.charAt(0).toUpperCase() + family.slice(1);
    return `Claude ${pretty} ${major}.${minor}`;
  }
  if (stripped === "codex") return "CODEX";
  if (stripped === "gpt-5-codex") return "GPT-5 CODEX";
  if (stripped.startsWith("gpt-")) return stripped.toUpperCase();
  return model;
}

export function modelFamilyColor(model: string | null | undefined): string {
  if (!model) return "#6b7084";
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku")) {
    return "#a78bfa";
  }
  if (m.includes("gpt") || m.includes("codex")) return "#f472b6";
  return "#6b7084";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- --run model-tokens`
Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/model-tokens.ts app/src/__tests__/model-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): model-tokens lib — short/long/family-color helpers

Adds uppercase-short names (OPUS/GPT-5/CODEX), pretty long names
(Claude Opus 4.7), and family colors (lavender for Claude, pink for
OpenAI). Existing formatters.ts::shortModel stays unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ModelChip` + integrate into `SessionRow`

**Files:**
- Create: `app/src/components/ModelChip.tsx`
- Modify: `app/src/components/SessionRow.tsx:32-38` (replace the current mono-text model line with `<ModelChip>`)
- Test: `app/src/__tests__/model-chip.test.tsx` (new)

- [ ] **Step 1: Write failing component test** — create `app/src/__tests__/model-chip.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelChip } from "../components/ModelChip";

describe("ModelChip", () => {
  it("renders the short model name", () => {
    render(<ModelChip model="claude-opus-4-7-20260501" />);
    expect(screen.getByText("OPUS")).toBeInTheDocument();
  });
  it("renders an em dash for null model", () => {
    render(<ModelChip model={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("paints with the Claude family color when model is claude-family", () => {
    const { container } = render(<ModelChip model="claude-sonnet-4-6" />);
    const chip = container.querySelector("span");
    expect(chip).toBeTruthy();
    expect(chip!.getAttribute("style")).toContain("#a78bfa");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- --run model-chip`
Expected: fail — component does not exist.

- [ ] **Step 3: Create `ModelChip.tsx`** — `app/src/components/ModelChip.tsx`:

```tsx
import { modelShortName, modelFamilyColor } from "../lib/model-tokens";

interface Props {
  model: string | null | undefined;
}

export function ModelChip({ model }: Props) {
  const name = modelShortName(model);
  const color = modelFamilyColor(model);
  return (
    <span
      className="shrink-0 font-mono font-semibold tracking-wide px-1.5 py-0.5 rounded"
      style={{
        fontSize: "9px",
        background: "rgba(255,255,255,0.08)",
        color,
      }}
    >
      {name}
    </span>
  );
}
```

- [ ] **Step 4: Integrate into `SessionRow.tsx`** — open `app/src/components/SessionRow.tsx`. Replace lines 32-38 (the `<span className="text-[12px] ...">description</span>` + the mono model span) with:

```tsx
        <span className={`text-[12px] truncate ${selected ? "text-white font-semibold" : "text-white/80"}`}>
          {session.description || "(no description)"}
        </span>
        <ModelChip model={session.model} />
```

Also add the import at the top of `SessionRow.tsx`:

```tsx
import { ModelChip } from "./ModelChip";
```

And remove the now-unused `shortModel` import (change line 3):

```tsx
import { repoName } from "../lib/formatters";
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd app && npm test -- --run model-chip`
Expected: 3 tests pass.

Run: `cd app && npm run typecheck`
Expected: clean.

Run: `cd app && npm test -- --run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ModelChip.tsx app/src/__tests__/model-chip.test.tsx app/src/components/SessionRow.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): ModelChip in left-rail SessionRow

Compact 9px uppercase chip next to each session title, colored by
model family (Claude lavender / OpenAI pink / neutral). Replaces the
inline mono-text model label in SessionRow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `ModelPill` + integrate into `SessionHeader`

**Files:**
- Create: `app/src/components/ModelPill.tsx`
- Modify: `app/src/components/SessionHeader.tsx:25-45` (add `<ModelPill>` next to the RUNNING badge)
- Test: `app/src/__tests__/model-pill.test.tsx` (new)

- [ ] **Step 1: Write failing test** — create `app/src/__tests__/model-pill.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelPill } from "../components/ModelPill";

describe("ModelPill", () => {
  it("renders pretty long-form name", () => {
    render(<ModelPill model="claude-opus-4-7-20260501" />);
    expect(screen.getByText("Claude Opus 4.7")).toBeInTheDocument();
  });
  it("renders 'Unknown' when model is null", () => {
    render(<ModelPill model={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
  it("paints background with family color at low opacity", () => {
    const { container } = render(<ModelPill model="gpt-5" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.getAttribute("style")).toContain("#f472b6");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- --run model-pill`
Expected: fail — component does not exist.

- [ ] **Step 3: Create `ModelPill.tsx`** — `app/src/components/ModelPill.tsx`:

```tsx
import { modelLongName, modelFamilyColor } from "../lib/model-tokens";

interface Props {
  model: string | null | undefined;
}

export function ModelPill({ model }: Props) {
  const name = modelLongName(model);
  const color = modelFamilyColor(model);
  return (
    <span
      className="rounded-full px-2 py-[3px] text-[10px] font-medium tracking-wide"
      style={{
        background: `${color}26`,
        color: color,
      }}
    >
      {name}
    </span>
  );
}
```

- [ ] **Step 4: Integrate into `SessionHeader.tsx`** — open `app/src/components/SessionHeader.tsx`. After the `<div>` that holds title + repo-path line (the outer `<div>` ending at line 24), add `<ModelPill>` between that block and the running/closed pill. Final shape of the component's JSX:

```tsx
export function SessionHeader({ session }: Props) {
  const token = hostToken(session.hostKind);
  const elapsed = elapsedSince(session.startTime);

  return (
    <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[14px] text-white font-semibold truncate">{session.description || "Session"}</div>
        <div className="text-[11px] text-white/50 font-mono mt-0.5 truncate">
          {session.repoPath ? `${repoName(session.repoPath)} · ` : ""}
          {token.label} · {elapsed}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ModelPill model={session.model} />
        {session.isLive ? (
          <motion.div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: `${token.color}1A` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: token.color }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[11px] text-white/75">Running</span>
          </motion.div>
        ) : (
          <div className="rounded-full px-2.5 py-1 bg-white/5">
            <span className="text-[11px] text-white/55">Closed · {relativeTime(session.endTime)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

Add the import at the top:

```tsx
import { ModelPill } from "./ModelPill";
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd app && npm test -- --run model-pill && npm run typecheck`
Expected: pills render, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ModelPill.tsx app/src/__tests__/model-pill.test.tsx app/src/components/SessionHeader.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): ModelPill in SessionHeader

Full-name model pill next to the RUNNING badge, tinted by family
color. Makes the model answerable without scanning the footer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Drop model segment from `SessionFooter`

**Files:**
- Modify: `app/src/components/SessionFooter.tsx:15-24`

- [ ] **Step 1: Replace the footer contents** — open `app/src/components/SessionFooter.tsx`. Replace the entire return JSX (lines 14-26) with:

```tsx
  return (
    <div className="px-5 py-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-white/45">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: token.color }} aria-hidden />
          <span className="text-white/60">{token.label}</span>
          {session.isLive && <span className="text-white/40">· working</span>}
        </span>
        {session.costUsd > 0 && <span>{formatCost(session.costUsd)}</span>}
      </div>
      <div className="font-mono">{fileCount} files touched</div>
    </div>
  );
```

(Change: the `humanModel(session.model)` is replaced by `token.label` — the host label — since model moved to the header.)

Also remove the now-unused `humanModel` import at the top (change line 2):

```tsx
// delete: import { humanModel } from "../lib/formatters";
```

- [ ] **Step 2: Typecheck + tests**

Run: `cd app && npm run typecheck && npm test -- --run`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/SessionFooter.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): SessionFooter drops model — it's in the header now

The model name moved up to SessionHeader via ModelPill in T4. Footer
regains its space for cost + file count, showing the host label
instead of the redundant model name.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `tool-verbs.ts` — tool call → plain-English verb

**Files:**
- Create: `app/src/lib/tool-verbs.ts`
- Create: `app/src/__tests__/tool-verbs.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/src/__tests__/tool-verbs.test.ts
import { describe, it, expect } from "vitest";
import { toolVerb } from "../lib/tool-verbs";

describe("toolVerb", () => {
  it("maps Edit and Write to 'Editing…'", () => {
    expect(toolVerb(["Edit"])).toBe("Editing…");
    expect(toolVerb(["Write"])).toBe("Editing…");
  });
  it("maps Bash to 'Running a command…'", () => {
    expect(toolVerb(["Bash"])).toBe("Running a command…");
  });
  it("maps Read/Grep/Glob to 'Reading the code…'", () => {
    expect(toolVerb(["Read"])).toBe("Reading the code…");
    expect(toolVerb(["Grep"])).toBe("Reading the code…");
    expect(toolVerb(["Glob"])).toBe("Reading the code…");
  });
  it("maps WebFetch/WebSearch to 'Looking something up…'", () => {
    expect(toolVerb(["WebFetch"])).toBe("Looking something up…");
    expect(toolVerb(["WebSearch"])).toBe("Looking something up…");
  });
  it("maps Task to 'Dispatching a sub-agent…'", () => {
    expect(toolVerb(["Task"])).toBe("Dispatching a sub-agent…");
  });
  it("falls back to 'Working…' for unknown tools", () => {
    expect(toolVerb(["WhateverTool"])).toBe("Working…");
  });
  it("returns null for empty tool list", () => {
    expect(toolVerb([])).toBeNull();
  });
  it("prefers the first tool when several are present", () => {
    // Order-stable: if an assistant turn reports multiple tools in one block,
    // we describe the first so the line doesn't flicker as the list grows.
    expect(toolVerb(["Edit", "Read", "Bash"])).toBe("Editing…");
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd app && npm test -- --run tool-verbs`
Expected: fail — module not found.

- [ ] **Step 3: Implement** — `app/src/lib/tool-verbs.ts`:

```ts
/**
 * Map the most recent tool call(s) of a session turn to a plain-English
 * verb shown in the PulseLine. Input is a list because an assistant turn
 * can emit multiple tool_use blocks in one message; we describe the first
 * one so the line doesn't flicker as further tools are appended.
 */

export function toolVerb(toolNames: string[]): string | null {
  if (toolNames.length === 0) return null;
  const first = toolNames[0];
  if (first === "Edit" || first === "Write") return "Editing…";
  if (first === "Bash") return "Running a command…";
  if (first === "Read" || first === "Grep" || first === "Glob") return "Reading the code…";
  if (first === "WebFetch" || first === "WebSearch") return "Looking something up…";
  if (first === "Task") return "Dispatching a sub-agent…";
  return "Working…";
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app && npm test -- --run tool-verbs`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/tool-verbs.ts app/src/__tests__/tool-verbs.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): tool-verbs lib — tool call to plain-English verb

Maps Edit/Write/Bash/Read/Grep/Glob/WebFetch/WebSearch/Task to human
verbs for the PulseLine. Falls back to "Working…" for anything unknown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `PulseLine` component

**Files:**
- Create: `app/src/components/PulseLine.tsx`
- Create: `app/src/__tests__/pulse-line.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// app/src/__tests__/pulse-line.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PulseLine } from "../components/PulseLine";

describe("PulseLine", () => {
  const now = new Date("2026-04-23T10:00:00Z").getTime();

  it("renders the verb derived from the latest tool", () => {
    render(
      <PulseLine
        toolNames={["Edit"]}
        turnAt="2026-04-23T09:59:50Z"
        now={now}
        isLive={true}
      />,
    );
    expect(screen.getByText("Editing…")).toBeInTheDocument();
  });

  it("returns null when no tool names", () => {
    const { container } = render(
      <PulseLine toolNames={[]} turnAt={null} now={now} isLive={true} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when session is not live", () => {
    const { container } = render(
      <PulseLine
        toolNames={["Bash"]}
        turnAt="2026-04-23T09:59:55Z"
        now={now}
        isLive={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders stale (50% opacity) when last tool was >45s ago", () => {
    const { container } = render(
      <PulseLine
        toolNames={["Bash"]}
        turnAt="2026-04-23T09:59:00Z"  // 60s ago
        now={now}
        isLive={true}
      />,
    );
    const row = container.firstChild as HTMLElement;
    expect(row.getAttribute("style")).toContain("opacity: 0.5");
  });

  it("renders at full opacity when recent", () => {
    const { container } = render(
      <PulseLine
        toolNames={["Bash"]}
        turnAt="2026-04-23T09:59:50Z"  // 10s ago
        now={now}
        isLive={true}
      />,
    );
    const row = container.firstChild as HTMLElement;
    expect(row.getAttribute("style") || "").not.toContain("opacity: 0.5");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- --run pulse-line`
Expected: fail — module not found.

- [ ] **Step 3: Implement** — `app/src/components/PulseLine.tsx`:

```tsx
import { toolVerb } from "../lib/tool-verbs";

interface Props {
  toolNames: string[];
  turnAt: string | null;       // ISO-8601 timestamp of the latest turn
  now: number;                 // Date.now() injected for tests
  isLive: boolean;
}

const STALE_AFTER_MS = 45_000;

export function PulseLine({ toolNames, turnAt, now, isLive }: Props) {
  if (!isLive) return null;
  const verb = toolVerb(toolNames);
  if (!verb) return null;

  const ageMs = turnAt ? now - new Date(turnAt).getTime() : 0;
  const stale = ageMs > STALE_AFTER_MS;

  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-sm border-l-2 border-ok bg-ok/5 px-2.5 py-1.5 font-mono text-mono text-ok"
      style={stale ? { opacity: 0.5 } : undefined}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full bg-ok animate-pulse-alive"
      />
      <span>{verb}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app && npm test -- --run pulse-line`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/PulseLine.tsx app/src/__tests__/pulse-line.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): PulseLine component — live 'doing X right now' row

Reads latest tool_names + turn timestamp, maps to verb via tool-verbs.
Fades to 50% opacity after 45s of no new tool call. Hidden when
session is not live or no tools are known.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `get_recent_turns` Tauri command

**Files:**
- Modify: `app/src-tauri/src/commands.rs` — append new command after `get_summary`
- Modify: `app/src-tauri/src/main.rs` — register it in the Tauri handler
- Modify: `app/src/types.ts` — add `SessionTurn` frontend type
- Modify: `app/src/hooks.ts` — poll `get_recent_turns` per selected session

- [ ] **Step 1: Read `main.rs` to find the Tauri command registration** — `app/src-tauri/src/main.rs`:

Look for the `.invoke_handler(tauri::generate_handler![...])` block. You're adding `get_recent_turns` to that list.

- [ ] **Step 2: Append the command to `commands.rs`** — at the bottom of `app/src-tauri/src/commands.rs`:

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct SessionTurnRow {
    pub session_id: String,
    pub timestamp: String,
    pub role: String,
    pub text: String,
    pub tool_names: Vec<String>,
    pub source: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_recent_turns(session_id: String, limit: Option<i64>) -> Result<Vec<SessionTurnRow>, String> {
    let store = open_store()?;
    let turns = store
        .recent_turns(&session_id, limit.unwrap_or(16))
        .map_err(|e| format!("Query failed: {e}"))?;
    Ok(turns
        .into_iter()
        .map(|t| SessionTurnRow {
            session_id: t.session_id,
            timestamp: t.timestamp.to_rfc3339(),
            role: t.role,
            text: t.text,
            tool_names: t.tool_names,
            source: t.source,
        })
        .collect())
}
```

- [ ] **Step 3: Register the command** — in `app/src-tauri/src/main.rs`, add `get_recent_turns` to the `invoke_handler` list.

- [ ] **Step 4: Verify Tauri build**

Run: `cd app/src-tauri && cargo check 2>&1 | grep -E "^error" || echo OK`
Expected: `OK`.

- [ ] **Step 5: Add `SessionTurn` type to frontend** — in `app/src/types.ts`, after the `LiveSessionRow` interface, add:

```ts
export interface SessionTurn {
  session_id: string;
  timestamp: string;
  role: string;
  text: string;
  tool_names: string[];
  source: string;
}
```

- [ ] **Step 6: Poll the command in `useDaemonData`** — in `app/src/hooks.ts`:

Extend the `DaemonState` interface (around line 31-52) with:

```ts
  /** Recent session turns for the currently-selected session (16 newest, ascending by insertion). */
  recentTurns: SessionTurn[];
```

Add the import at the top:

```ts
import type {
  // ... existing imports
  SessionTurn,
} from "./types";
```

Add a state hook near the other useStates (around line 78):

```ts
  const [recentTurns, setRecentTurns] = useState<SessionTurn[]>([]);
```

In the `Promise.all` inside `fetchAll`, add a parallel fetch for recent turns (after `sessionSummary`):

```ts
        activeSessionId
          ? invoke<SessionTurn[]>("get_recent_turns", { sessionId: activeSessionId, limit: 16 }).catch(() => [] as SessionTurn[])
          : Promise.resolve([] as SessionTurn[]),
```

Update the tuple destructuring to receive it (rename to match — it's the 13th element):

```ts
      const [evts, agents, cols, stats, count, cost, commits, summary, hostRows, liveRows, cliStatus, sessionSummary, turnsResult] = await Promise.all([...]);
```

Then `setRecentTurns(turnsResult);` after the other setters.

Include `recentTurns` in the demo-mode fallback branch (set to `[]`) and in the returned object.

- [ ] **Step 7: Typecheck**

Run: `cd app && npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add app/src-tauri/src/commands.rs app/src-tauri/src/main.rs app/src/types.ts app/src/hooks.ts
git commit -m "$(cat <<'EOF'
feat(tauri): get_recent_turns command + frontend polling

Exposes store.recent_turns via Tauri so the UI can drive PulseLine and
MilestoneFeed off the same data the daemon already persists. Polls in
useDaemonData only when a session is selected; falls back to [] on
error or when no session is active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `MilestoneFeed` component

**Files:**
- Create: `app/src/components/MilestoneFeed.tsx`
- Create: `app/src/__tests__/milestone-feed.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// app/src/__tests__/milestone-feed.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MilestoneFeed } from "../components/MilestoneFeed";
import type { SessionTurn } from "../types";

function turn(partial: Partial<SessionTurn>): SessionTurn {
  return {
    session_id: "s1",
    timestamp: "2026-04-23T10:00:00Z",
    role: "assistant",
    text: "",
    tool_names: [],
    source: "claude",
    ...partial,
  };
}

describe("MilestoneFeed", () => {
  it("renders empty state when no qualifying turns", () => {
    render(<MilestoneFeed turns={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("includes only assistant turns with non-empty text and no tool calls", () => {
    const turns: SessionTurn[] = [
      turn({ timestamp: "2026-04-23T10:00:00Z", role: "user", text: "fix X" }),
      turn({ timestamp: "2026-04-23T10:00:01Z", role: "assistant", text: "On it.", tool_names: [] }),
      turn({ timestamp: "2026-04-23T10:00:02Z", role: "assistant", text: "", tool_names: ["Edit"] }),
      turn({ timestamp: "2026-04-23T10:00:03Z", role: "assistant", text: "Done.", tool_names: [] }),
    ];
    render(<MilestoneFeed turns={turns} />);
    expect(screen.getByText(/on it/i)).toBeInTheDocument();
    expect(screen.getByText(/done/i)).toBeInTheDocument();
    expect(screen.queryByText(/fix x/i)).not.toBeInTheDocument();
  });

  it("caps at 6 most recent milestones", () => {
    const turns: SessionTurn[] = Array.from({ length: 10 }).map((_, i) =>
      turn({ timestamp: `2026-04-23T10:00:${String(i).padStart(2, "0")}Z`, text: `step ${i}` }),
    );
    render(<MilestoneFeed turns={turns} />);
    // newest 6 = step 4..9
    expect(screen.queryByText(/step 3/)).not.toBeInTheDocument();
    expect(screen.getByText(/step 4/)).toBeInTheDocument();
    expect(screen.getByText(/step 9/)).toBeInTheDocument();
  });

  it("renders timestamps in H:MM format", () => {
    render(
      <MilestoneFeed
        turns={[turn({ timestamp: "2026-04-23T14:07:00Z", text: "Ran the tests." })]}
      />,
    );
    // We don't control the timezone in tests. Assert the shape instead.
    expect(document.querySelector("[data-milestone-time]")?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd app && npm test -- --run milestone-feed`
Expected: fail — component not found.

- [ ] **Step 3: Implement** — `app/src/components/MilestoneFeed.tsx`:

```tsx
import type { SessionTurn } from "../types";

interface Props {
  turns: SessionTurn[];
}

const MAX_VISIBLE = 6;

export function MilestoneFeed({ turns }: Props) {
  const milestones = turns
    .filter(t => t.role === "assistant" && t.text.trim().length > 0 && t.tool_names.length === 0)
    .slice(-MAX_VISIBLE);

  if (milestones.length === 0) return null;

  return (
    <ul className="mt-3 pt-3 border-t border-white/5 space-y-1 list-none pl-0" role="list">
      {milestones.map(m => {
        const d = new Date(m.timestamp);
        const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        return (
          <li
            key={m.timestamp}
            className="flex gap-2.5 text-feed text-white/75"
            role="listitem"
          >
            <span
              data-milestone-time
              className="w-10 shrink-0 font-mono text-white/45 tabular-nums"
            >
              {hhmm}
            </span>
            <span className="flex-1">{firstSentence(m.text)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Keep each milestone to one readable sentence. Clips at first period/newline. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?\n]{1,140}[.!?]/);
  if (match) return match[0];
  if (trimmed.length > 120) return trimmed.slice(0, 117) + "…";
  return trimmed;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app && npm test -- --run milestone-feed`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/MilestoneFeed.tsx app/src/__tests__/milestone-feed.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): MilestoneFeed — timelined plain-English turn history

Filters session turns to assistant-with-text-and-no-tools. Caps at 6.
Derives HH:MM from the turn timestamp. Clips each entry to the first
sentence. Returns null when there are no qualifying turns so the
summary block doesn't render an empty divider.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Rewire `SummaryBlock` to compose paragraph + PulseLine + MilestoneFeed

**Files:**
- Modify: `app/src/components/SummaryBlock.tsx`
- Modify: `app/src/components/layout/MiddlePane.tsx` — pass new props (if needed)
- Modify: `app/src/App.tsx` or wherever `SummaryBlock` is used — pass `turns` through

- [ ] **Step 1: Replace `SummaryBlock.tsx`** — full rewrite to compose the three pieces:

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import { relativeTimeFromIso } from "../lib/formatters";
import { modelLongName } from "../lib/model-tokens";
import { PulseLine } from "./PulseLine";
import { MilestoneFeed } from "./MilestoneFeed";
import type { HostKind, SessionTurn } from "../types";

interface Props {
  summary: string | null;
  generatedAt: string | null;
  hostKind: HostKind;
  model: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  fallbackDescription?: string;
  hasCli: boolean;
  /** Live session turns — newest at end. Drives PulseLine + MilestoneFeed. */
  turns: SessionTurn[];
  isLive: boolean;
}

export function SummaryBlock({
  summary, generatedAt, hostKind, model, onRefresh, isRefreshing, fallbackDescription, hasCli, turns, isLive,
}: Props) {
  const token = hostToken(hostKind);
  const display = summary ?? fallbackDescription ?? "";
  const latest = turns.length > 0 ? turns[turns.length - 1] : null;

  return (
    <div
      className="px-5 py-4 border-b border-white/5"
      style={{ background: `linear-gradient(180deg, ${token.color}0F, transparent)` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-label uppercase text-white/40 font-semibold">
          What's happening
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || !hasCli}
            className="text-[11px] text-white/50 hover:text-white/80 disabled:opacity-40 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
          >
            {isRefreshing ? "refreshing…" : "refresh"}
          </button>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={display || "empty"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[13px] text-white/90 leading-relaxed"
        >
          {display
            ? display
            : hasCli
              ? <ShimmerLines />
              : <div className="text-white/55">Connect Claude or Codex in settings to see plain-English summaries of what the agent is doing.</div>}
        </motion.div>
      </AnimatePresence>
      <PulseLine
        toolNames={latest?.tool_names ?? []}
        turnAt={latest?.timestamp ?? null}
        now={Date.now()}
        isLive={isLive}
      />
      <MilestoneFeed turns={turns} />
      {generatedAt && (
        <div className="mt-3 text-[11px] text-white/40">
          Generated {relativeTimeFromIso(generatedAt)}
          {model ? ` by ${modelLongName(model)}` : null}
        </div>
      )}
    </div>
  );
}

function ShimmerLines() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 rounded bg-white/6 animate-pulse w-[92%]" />
      <div className="h-3 rounded bg-white/6 animate-pulse w-[78%]" />
      <div className="h-3 rounded bg-white/6 animate-pulse w-[64%]" />
    </div>
  );
}
```

- [ ] **Step 2: Find and update all `<SummaryBlock>` call sites**

Run: `grep -rn "<SummaryBlock" app/src`
Expected: one or two call sites in `MiddlePane.tsx` (and maybe elsewhere).

Each call site needs to pass the two new props: `turns` (from `useDaemonData` → `recentTurns`) and `isLive` (from the selected session's `session.isLive`). Update the call site(s) accordingly. The most likely shape of the MiddlePane change is threading `turns` and `isLive` through the component's props (or via `useDaemonData` directly inside MiddlePane).

Open `app/src/components/layout/MiddlePane.tsx`. If its interface receives the session object plus hasCli/summary, extend it to also receive `turns: SessionTurn[]`. Pass through to SummaryBlock.

Open `app/src/App.tsx`. At the `<MiddlePane ... />` call site, pass `turns={data.recentTurns}` (and `isLive` is already available via `selected.isLive`).

- [ ] **Step 3: Typecheck + tests**

Run: `cd app && npm run typecheck && npm test -- --run`
Expected: all tests pass.

- [ ] **Step 4: Smoke test (optional)** — `./dev.sh`, start a Claude Code session with at least one assistant turn, confirm SummaryBlock shows the three layered pieces.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/SummaryBlock.tsx app/src/components/layout/MiddlePane.tsx app/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): SummaryBlock composes paragraph + PulseLine + MilestoneFeed

Closes the layered+timelined summary block from the V2 spec. Paragraph
stays identical; PulseLine reads the latest turn's tool_names for the
live 'doing X' row; MilestoneFeed renders the last ~6 plain text
assistant turns with timestamps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Motion rhythm consolidation

**Files:**
- Modify: `app/src/components/SessionRow.tsx` — replace stiffness/damping spring with `transition-base`
- Modify: `app/src/components/SessionHeader.tsx` — replace `duration: 2, repeat: Infinity` animation with `animate-pulse-alive` class (removing framer-motion for the dot)
- Modify: `app/src/components/HostGroup.tsx` if it has a pulse dot — same replacement
- Modify: `app/src/components/CommandPalette.tsx` — standardize transition durations

- [ ] **Step 1: Find every pulse/animation in components**

Run: `grep -rn "opacity: \[0.6" app/src/components`
Expected: two or three hits (session header, host group, maybe elsewhere).

Run: `grep -rn "duration: 2, repeat: Infinity" app/src/components`
Expected: the same hits.

- [ ] **Step 2: Replace each with the shared class** — for each hit, change:

```tsx
<motion.span
  aria-hidden
  className="w-1.5 h-1.5 rounded-full"
  style={{ background: token.color }}
  animate={{ opacity: [0.6, 1, 0.6] }}
  transition={{ duration: 2, repeat: Infinity }}
/>
```

to:

```tsx
<span
  aria-hidden
  className="w-1.5 h-1.5 rounded-full animate-pulse-alive"
  style={{ background: token.color }}
/>
```

Also remove the unused `motion.span` import if it's no longer needed in the file.

- [ ] **Step 3: Swap transitions** — in `SessionRow.tsx`, line 24, change `transition-colors` to `transition-colors duration-fast`. In `CommandPalette.tsx` search for `transition-` classes and add `duration-fast` or `duration-base` per whether it's a hover (fast) or a modal mount (base).

- [ ] **Step 4: Typecheck + tests + smoke**

Run: `cd app && npm run typecheck && npm test -- --run`
Expected: green. The running-dot unit tests should still pass because the dot continues to exist — only the animation mechanism changed.

- [ ] **Step 5: Commit**

```bash
git add app/src/components
git commit -m "$(cat <<'EOF'
refactor(frontend): consolidate pulse animations and transition timing

Replace ad-hoc Framer Motion opacity pulses with the shared
animate-pulse-alive keyframe from tailwind.config.js. Standardize
hover transitions on duration-fast (120ms), modal mounts on
duration-base (180ms). Drops motion.span in places where it's
used only for the pulse — plain <span> with the animation class.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Empty / loading / error state polish

**Files:**
- Modify: `app/src/components/layout/MiddlePane.tsx` — polish "No agents active" hero
- Modify: `app/src/App.tsx` — polish disconnected banner with "Retry now"
- Modify: `app/src/components/SummaryBlock.tsx` — slightly only (already has ShimmerLines)

- [ ] **Step 1: Find the "No agents active" hero** in `MiddlePane.tsx`

Run: `grep -n "No agents\|no session\|empty" app/src/components/layout/MiddlePane.tsx`

- [ ] **Step 2: Update the empty state** — replace the empty block inside `MiddlePane.tsx` with:

```tsx
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <span
          aria-hidden
          className="w-3 h-3 rounded-full bg-white/25 mb-4 animate-pulse-alive"
        />
        <div className="text-title text-white/75 mb-1">No agents active</div>
        <div className="text-[12px] text-white/45 leading-relaxed max-w-[280px]">
          Vigil will light up when you start Claude Code, Cursor, or Codex in a terminal.
        </div>
      </div>
```

- [ ] **Step 3: Polish disconnected banner in `App.tsx`** — replace the existing banner block (around lines 41-46) with:

```tsx
      {!data.connected && (
        <div className="bg-rose-500/10 border-b border-rose-400/20 px-3.5 py-1 text-[11px] text-rose-200 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse-alive" />
          <span>Daemon not reachable · last seen {data.error ?? "never"}</span>
          <button
            type="button"
            className="ml-auto underline decoration-rose-200/40 underline-offset-2 hover:decoration-rose-200 transition-colors duration-fast"
            onClick={() => window.location.reload()}
          >
            Retry now
          </button>
        </div>
      )}
```

- [ ] **Step 4: Typecheck + tests**

Run: `cd app && npm run typecheck && npm test -- --run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/MiddlePane.tsx app/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): polish empty and disconnected states

MiddlePane no-session hero gets a pulsing indicator dot, title, and
a subtitle instead of the bare text line. Disconnected banner grows
a Retry now link that reloads the window. Both use the shared
pulse-alive keyframe from T11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Hover / focus polish

**Files:**
- Modify: `app/src/components/SessionRow.tsx` — hover tint + visible focus ring
- Modify: `app/src/components/layout/RightRail.tsx` — tab button hover + focus ring
- Modify: `app/src/components/TopBar.tsx` — command palette button focus ring

- [ ] **Step 1: `SessionRow` hover + focus** — replace the `className` on the `motion.button` (line 24) with:

```tsx
      className="w-full text-left px-2.5 py-2 rounded-md transition-colors duration-fast hover:bg-white/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
```

- [ ] **Step 2: `RightRail` tab buttons** — in the `TabButton` component inside `RightRail.tsx`, update the `className` prop to include a focus ring and a hover underline:

```tsx
      className={`pb-0.5 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40 ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75 hover:underline decoration-white/30 underline-offset-4"}`}
```

- [ ] **Step 3: `TopBar` command palette button** — find the button in `app/src/components/TopBar.tsx` and add the same focus-visible classes (`focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40`) to its `className`.

- [ ] **Step 4: Typecheck + tests**

Run: `cd app && npm run typecheck && npm test -- --run`
Expected: clean.

- [ ] **Step 5: Smoke test (optional)** — `./dev.sh`, tab through the UI, confirm focus rings appear on keyboard focus.

- [ ] **Step 6: Commit**

```bash
git add app/src/components
git commit -m "$(cat <<'EOF'
feat(frontend): visible focus rings and hover states

SessionRow hover tint + focus ring. RightRail tab buttons gain a
hover underline (so mouse and keyboard both get a preview) and a
focus ring. TopBar command button gets the same focus ring. All rings
use the consistent outline-white/40 offset-1 pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- §3.1 Summary block redesign → T6, T7, T8, T9, T10 ✓
- §3.2 Model indicator → T2, T3, T4, T5 ✓
- §3.4.1 Typography scale → T1 (tokens added); audit pass deferred to V2b or follow-up (many existing `text-[11px]` don't block the new components from rendering correctly — noted as known deviation, see §12 below).
- §3.4.2 Motion rhythm → T1 (tokens) + T11 (application) ✓
- §3.4.3 Empty / loading / error → T12 ✓ (tab-specific empty states come with V2b tabs)
- §3.4.4 Hover / focus polish → T13 ✓
- §3.4.5 Color calibration → T1 adds semantic tokens; replacement audit is deferred alongside the typography audit.
- §3.3 Right-rail live tabs → **intentionally deferred to V2b**; the spec's own §8 anticipates this split.

**Placeholder scan:** None. Every step has exact code or exact commands.

**Type consistency:**
- `modelShortName` / `modelLongName` / `modelFamilyColor` used consistently across T2-T4.
- `toolVerb` (T6) consumed by `PulseLine` (T7) consumed by `SummaryBlock` (T10).
- `SessionTurn` type defined in T8, consumed by T9 and T10.
- `get_recent_turns` command wired through `useDaemonData` in T8, consumed by SummaryBlock in T10.

## Known deviations from spec

- **Typography & color audit sweep deferred.** The spec called for replacing every `text-[11px]` / `text-xs` in the frontend with the new `text-label` / `text-stat` classes, and every hex literal with `text-ok` / `bg-warn/10` / etc. V2a adds the tokens in T1 so new code uses them, but the existing-code migration is a follow-up. Rationale: the migration is mechanical but noisy, and the new components + polish changes already demonstrate the target aesthetic without churning every existing class.
- **Live tab badges deferred to V2b** (they depend on the tab content that V2b builds).
