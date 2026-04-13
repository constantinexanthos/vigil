# Vigil — Product Positioning & Build Plan

> **The control plane for coding agents. Monitor every AI agent on your machine — Claude Code, Cursor, Codex, Conductor — in one dashboard. See what they're doing, what they're costing, and whether you should trust their output.**

*April 2026 · Confidential*

---

## 1. The Opportunity

Developers are shipping code written by fleets of AI agents they cannot effectively monitor, verify, or roll back. The AI code review market has attracted over $300M in funding across 20+ startups, but these tools solve yesterday's bottleneck: reviewing human-written PRs. The real pain — orchestrating, observing, and trusting parallel autonomous agents — sits in a gap between mature LLMOps platforms (which ignore code-specific workflows) and nascent agent orchestrators (which ignore trust and verification).

No well-funded startup owns this problem yet.

### Market signals

- 66% of developers plan to use coding agents within 12 months
- Google's DORA report: AI adoption correlates with 9% more bugs and 91% more code review time
- AI-generated PRs carry a 32.7% acceptance rate vs 84.4% for human code
- Agent orchestrators (Conductor, Claude Squad, Superset) all shipped within a 2-week window in early 2026 — signaling explosive demand for multi-agent workflows
- The LLMOps market is projected to reach $19.8B by 2032, but Layer 3 (coding-agent-specific ops) is nearly empty

> **Conductor helps you run more agents. Vigil helps you trust what they produced.**

---

## 2. Positioning

### One-liner

The control plane for coding agents. Monitor every AI agent on your machine — Claude Code, Cursor, Codex, Conductor — in one dashboard. See what they're doing, what they're costing, and whether you should trust their output.

### The pitch (30 seconds)

Right now, developers are running 3–5 AI coding agents in parallel and have zero visibility into what those agents are actually doing. Conductor helps you launch them. We help you trust what they produced. We're a lightweight CLI daemon and menu bar app that watches every agent on your machine — any provider, any terminal — and gives you a unified view of activity, cost, and code quality. Think of it as the Datadog for coding agents, but local-first, $20/month, and installed in 30 seconds.

### What we are NOT

- **Not a code review tool** — CodeRabbit and Qodo review PRs after they're opened. We operate during agent execution and before the PR exists.
- **Not an orchestrator** — Conductor spawns and manages agents. We observe and verify agents regardless of how they were launched.
- **Not an LLMOps platform** — Langfuse and Braintrust track API calls and tokens. We track code-specific actions: files modified, PRs created, imports resolved, architectural consistency.
- **Not a chatbot or AI assistant** — We don't write code. We watch the things that write code.

---

## 3. Competitive Landscape

The market organizes into four layers. We occupy Layer 3, which is nearly empty.

| Layer | Players | What they do | Why we're different |
|-------|---------|-------------|-------------------|
| 1: Code review | CodeRabbit ($88M), Qodo ($120M), Greptile ($45M) | Post-hoc PR review | We operate during execution, not after. We catch conflicts before PRs exist |
| 2: Agent orchestration | Conductor (unfunded), Claude Squad (OSS), Superset (OSS) | Spawn and manage parallel agents | They launch agents. We verify output. Complementary, not competitive |
| 3: Coding agent ops | JetBrains Central (announced, not shipped), Datadog (feature add-on) | Monitor coding agent behavior | THIS IS US. No funded startup exists here. JetBrains is ecosystem-locked. Datadog is enterprise-priced cloud-only |
| 4: General LLMOps | Braintrust ($124M), Langfuse (acquired), Arize ($70M) | Track LLM API calls, tokens, evaluations | They don't understand code: files, PRs, imports, git, architecture. We do |

---

## 4. How It Works

### Three-layer architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Menu Bar App + Dashboard (Tauri)       │
├─────────────────────────────────────────────────┤
│  Layer 2: Deep Hooks (Claude, Cursor, OTLP)      │
├─────────────────────────────────────────────────┤
│  Layer 1: Universal Capture (FS + Git + Process)  │
└─────────────────────────────────────────────────┘
```

### Layer 1: Universal capture (works with everything)

A Rust daemon that runs in the background and monitors your project directories using OS-native file system events (FSEvents on macOS, inotify on Linux). It also watches git activity (branch creation, commits, worktree operations) and scans running processes to identify known agent runtimes.

This means that the moment you install the tool, it sees every coding agent on your machine — Claude Code, Cursor, Conductor sessions, Codex, Aider, Cline, or any custom script. Zero configuration. If something modifies your code, you see it.

All events are stored in a local SQLite database on your machine. No cloud. No telemetry. Privacy-first.

### Layer 2: Deep integrations (richer metadata per provider)

On top of the universal watcher, provider-specific hooks add richer context. Claude Code's native hooks API gives you token usage, model version, cost, and the agent's reasoning trace. Conductor's worktree structure lets you map each parallel track to its task. OpenTelemetry catches Codex and any future agent that emits traces.

These integrations are enhancements, not requirements. The product is useful before any of them exist.

### Layer 3: Trust intelligence

The verification layer that makes this a product, not just a dashboard. Confidence scoring (0–100) based on local heuristics: file count, import resolution, test coverage delta, self-correction loops, complexity change. Hallucination detection that verifies every import/require actually resolves to a real module. File collision alerts when two agents across different providers touch the same code. Selective rollback with per-file accept/reject after an agent session.

### User experience in 60 seconds

1. `brew install vigil` — single binary, 5MB, zero dependencies
2. `vigil init` — point it at your project directories. Daemon starts automatically
3. **Start working.** Launch Claude Code, open Cursor, spin up Conductor. Everything is captured
4. `vigil status` — see active agents, files being touched, collision warnings, burn rate
5. **Menu bar icon** — always-visible agent count, click to expand full dashboard with timeline, cost, and confidence scores
6. `vigil rollback` — interactive TUI to accept/reject per-file changes from any agent session

---

## 5. Supported Integrations

| Agent | Integration Method | Data Depth | Phase |
|-------|-------------------|-----------|-------|
| Any terminal process | File watcher + process detection | Full | 1 |
| Claude Code | Native hooks API + file watcher | Deep (tokens, cost, reasoning) | 1+2 |
| Cursor | Extension API + file watcher | Rich (sessions, files, context) | 2 |
| Conductor | Worktree detection + process scan | Rich (parallel tracks, status) | 2 |
| Claude Squad | tmux pane detection + file watcher | Moderate (per-pane activity) | 2 |
| OpenAI Codex | OpenTelemetry collector | Rich (tokens, cost, traces) | 2 |
| Aider | File watcher + git monitor | Moderate (changes, branches) | 1 |
| Cline / Roo | File watcher + process detection | Moderate (file changes) | 1 |
| Custom agents | `vigil register` CLI command | Configurable | 2 |

---

## 6. Technical Build Plan

### Language: Rust

The daemon needs to be a single binary with zero runtime dependencies, fast filesystem event handling, and minimal memory footprint. Rust is the clear choice. Warp, Zed, and Ghostty all chose Rust for similar reasons.

### Tech stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Daemon | Rust (tokio async runtime) | Non-blocking FS events, single binary ~5MB, zero deps |
| File watcher | notify-rs crate | OS-native events (FSEvents/inotify), handles 10k+ files |
| Process scanner | sysinfo crate | Cross-platform process tree inspection |
| Local database | SQLite via rusqlite | Zero-config, portable, fast writes for high-frequency events |
| CLI interface | clap (args) + ratatui (TUI) | Rich interactive TUI for rollback, clean CLI for status/log |
| Menu bar app | Tauri v2 | Native menu bar + webview dashboard, ~15MB total |
| Dashboard UI | React + Tailwind + Recharts | Fast iteration inside Tauri webview |
| Claude Code hooks | Claude Code Hooks API | Official hook system: PreToolUse, PostToolUse, Notification |
| Cross-provider telemetry | OpenTelemetry (OTLP) | Standard protocol for Codex + future providers |
| Team backend (Phase 4) | Supabase (Postgres + Auth) | Real-time subscriptions, row-level security |

### Day 1–2: Scaffold the Rust daemon

Create a new Rust project with cargo. Set up the core event loop using tokio. Implement the file system watcher using notify-rs that monitors a configured set of project directories. When a file change event fires, capture: timestamp, file path, event type (create/modify/delete), and the diffed content (using git diff if in a git repo). Write every event to a local SQLite database. At this stage the daemon just silently watches and records.

### Day 2–3: Process detection

Add the sysinfo crate. On each file change event, look up which process modified the file (on macOS you can correlate via FSEvents' pid field; on Linux via inotify + /proc). Maintain a lookup table of known agent process signatures: "claude" for Claude Code, "cursor-helper" or "Electron" with specific args for Cursor, "conductor", "aider", etc. Tag each event with its source agent. Unknown processes get tagged "unknown-agent."

### Day 3–4: Git activity monitor

Watch .git directories for changes. Detect branch creation, new commits, worktree creation (Conductor and Claude Squad use git worktrees for isolation). When a new worktree appears, start monitoring it automatically. Capture commit messages and associate them with the agent that created them.

### Day 4–5: CLI interface

Build three commands using clap:
- `vigil status` — list active agent sessions, which files each is touching, any collision warnings
- `vigil log` — chronological feed of agent actions, filterable by agent/repo/file
- `vigil watch ~/projects/epitro` — add a directory to monitoring

At this point you have a working product. It silently monitors your codebase, detects which agents are making changes, logs everything locally, and lets you query it from the terminal. This is your week 1 deliverable.

### Week 2–3: Collision detection + Claude Code deep hooks

Add the collision detection engine: when two different agent sessions modify the same file within a configurable time window, emit an alert to stderr and optionally send a system notification.

Then add Claude Code hooks integration. Claude Code exposes a hooks system in its settings file (~/.claude/settings.json) where you can register scripts to run on PreToolUse, PostToolUse, and Notification events. Your daemon registers itself as a hook consumer and receives rich structured data: the tool being used, the input/output, token counts, model version.

### Repository structure

```
vigil/
├── daemon/              # Rust crate — the core daemon
│   ├── src/
│   │   ├── main.rs        # Entry point, tokio runtime
│   │   ├── watcher.rs     # File system watcher (notify-rs)
│   │   ├── git.rs         # Git activity monitor
│   │   ├── process.rs     # Process detection + agent identification
│   │   ├── store.rs       # SQLite event store
│   │   ├── collision.rs   # Cross-agent collision detection
│   │   ├── hooks/         # Provider-specific integrations
│   │   │   ├── claude.rs  # Claude Code hooks
│   │   │   ├── cursor.rs  # Cursor session capture
│   │   │   └── otlp.rs    # OpenTelemetry receiver
│   │   ├── trust.rs       # Confidence scoring engine
│   │   └── cli.rs         # CLI commands (clap)
│   └── Cargo.toml
├── app/                 # Tauri v2 menu bar app
│   ├── src-tauri/       # Rust backend for Tauri
│   └── src/             # React dashboard UI
├── docs/
└── README.md
```

---

## 7. Go to Market

### Target users (in order)

1. **Conductor users** — already running multi-agent workflows, already feeling the review pain. The most obvious early adopters.
2. **Claude Code power users** — running Claude Code daily, burning through tokens, wanting visibility into cost and quality.
3. **Multi-tool developers** — switching between Cursor and Claude Code in the same session. The universal watcher gives them visibility no single-provider tool can.
4. **Engineering managers** — teams scaling from 1–2 agents to 5–10, needing cost visibility and quality guardrails. The enterprise upsell.

### Distribution

- **Homebrew / npm / AUR** — `brew install vigil`
- **Show HN + Twitter/X launch** — the playbook that Conductor, Claude Squad, and Superset all followed
- **Conductor community** — Discord/GitHub. Position as the companion tool
- **Claude Code community** — Anthropic forums, Claude Code hooks GitHub, r/ClaudeAI

### Pricing

- **Free:** Universal file watcher, 2 concurrent sessions, activity feed, collision alerts
- **Pro ($20/mo):** Unlimited sessions, deep integrations, cost tracking, confidence scoring, hallucination detection, rollback
- **Team ($40/seat/mo):** Team dashboard, cross-developer collision detection, shared cost budgets, PR acceptance analytics, SSO

---

## 8. Why This Wins

### The foresight thesis

Right now, most developers run 1–2 agents and can manually review everything. Within 12 months, the standard will be 5–10 parallel agents. The volume of AI-generated code will exceed human review capacity. Every engineering team will need a trust layer. We're building it before they realize they need it.

### The moat

Provider agnosticism is the moat. CodeRabbit is tied to GitHub PRs. Conductor only sees its own agents. Datadog is cloud-only enterprise pricing. We see everything because we watch the file system, not the API. As new agents emerge, they work with us automatically.

### The expansion path

Start as observability (see what your agents did). Add trust (confidence scores, hallucination detection). Add cost intelligence (spend optimization across providers). Add team coordination (cross-developer collision prevention). Each layer increases willingness-to-pay.

> The practical ceiling today is 3–5 parallel agents before coordination overhead overwhelms productivity gains. The startup that raises that ceiling to 10–20 agents by solving trust, observability, and conflict detection will own a category that every engineering team will need within 18 months.

---

## 9. The Visual Replay Expansion

### The market is bigger than engineers

Vigil as scoped in Phases 1–4 serves engineers who can read diffs. But the market is about to get dramatically larger. Vibe coding is real — product managers, designers, founders, and non-technical operators are already using Cursor, Claude Code, and Replit Agent to build and ship software they cannot review. They don't know what a diff is. They can't read a confidence score in a terminal. But they still need to understand and trust what their agents built.

This population is growing exponentially faster than the engineering population. Within 18 months, there will be more non-engineers generating code with AI agents than there are professional software engineers. They represent an entirely new market for trust and verification tooling — one that no existing product serves.

### Visual replay: making agent work digestible

For non-engineers, a diff is meaningless. What they need is to see what happened. The visual replay feature generates a video-style walkthrough of an agent's work session: "Your agent modified 12 files. Here's what it did in plain English. It added a login page, changed how your database stores passwords, and updated three API routes. Here's a 45-second replay showing each change in context."

This is not just a post-hoc replay. It's also a live view. Users can watch their agent work in real time, seeing files change and the project evolve, being present with what's happening even if they can't read every line of code. Think of it as "spectator mode" for agent coding — nobody has built this.

### Two surfaces, same data

The underlying daemon captures the same data for both audiences. The difference is the surface layer. Engineers get the CLI, the confidence scores, the terminal TUI, and the diff-level rollback. Non-engineers get the visual replay, the plain-language summary, and the live spectator view. Same event store. Same trust engine. Two completely different products from one codebase.

This dramatically expands the TAM. Instead of 30 million professional developers, the addressable market includes anyone using AI to build software — a population that could reach hundreds of millions within a few years. It also opens a second pricing tier: a "Creator" plan at $10–15/month for non-engineers who want visual replay and plain-language summaries without the full CLI toolkit.

### Phase 5 scope (weeks 13–16)

The visual replay layer ships after launch as Phase 5. It builds directly on the event store from Phase 1 and the session timeline from Phase 3. Key deliverables: a web-based replay viewer that renders agent sessions as visual walkthroughs with plain-language narration, a live spectator mode that streams agent activity in real time through the menu bar app, and an LLM-powered summary generator that produces natural-language descriptions of what each agent session accomplished. This is the feature that turns Vigil from a developer tool into a platform.

> **Engineers get the CLI. Vibe coders get the replay. Both get trust. That's how Vigil becomes the universal trust layer for AI-generated code — not just for people who can read diffs, but for everyone who ships with agents.**
