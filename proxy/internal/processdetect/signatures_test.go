package processdetect

import (
	"testing"
)

// TestMatchSignatureSeedTable is the table-driven check on the
// shipped signature map. Each entry models a real-world process chain
// (leaf-first) and asserts the inferred attribution. Adding rows here
// is the primary mechanism for raising the dogfood detection rate.
func TestMatchSignatureSeedTable(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		chain        []ProcessInfo
		wantAgent    string
		wantHarness  string
		wantConf     string
		wantNonEmpty bool
	}{
		{
			name: "Claude Code installed via homebrew",
			chain: []ProcessInfo{
				{Name: "claude", Path: "/opt/homebrew/bin/claude", PID: 1001, PPID: 1000},
				{Name: "zsh", Path: "/bin/zsh", PID: 1000, PPID: 999},
			},
			wantAgent:    "claude-code",
			wantHarness:  "claude-code",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "Claude Code installed at /usr/local/bin",
			chain: []ProcessInfo{
				{Name: "claude", Path: "/usr/local/bin/claude", PID: 1001, PPID: 1000},
				{Name: "bash", Path: "/bin/bash", PID: 1000, PPID: 999},
			},
			wantAgent:    "claude-code",
			wantHarness:  "claude-code",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "Claude Code as node-hosted npm install",
			chain: []ProcessInfo{
				{
					Name:       "node",
					Path:       "/Users/costa/.nvm/versions/node/v20.0.0/bin/node",
					CmdlineRaw: "node /Users/costa/.npm-packages/lib/node_modules/@anthropic-ai/claude-code/cli.js",
					PID:        1001, PPID: 1000,
				},
				{Name: "zsh", Path: "/bin/zsh", PID: 1000, PPID: 999},
			},
			wantAgent:    "claude-code",
			wantHarness:  "claude-code",
			// The @anthropic-ai/claude-code fragment in argv is a
			// definitive install signal even though the leaf binary
			// is "node", so we keep "high" confidence.
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "Claude Code: node leaf without identifying fragment is unmatched",
			chain: []ProcessInfo{
				{
					Name:       "node",
					Path:       "/Users/costa/.nvm/versions/node/v20.0.0/bin/node",
					CmdlineRaw: "node /Users/costa/random-script.js",
					PID:        1001, PPID: 1000,
				},
				{Name: "zsh", Path: "/bin/zsh", PID: 1000, PPID: 999},
			},
			// A bare `node` with no claude-y argv falls through to
			// human-script — we explicitly do NOT want to claim
			// every node process is Claude Code.
			wantAgent:    "human-script",
			wantHarness:  "node",
			wantConf:     "low",
			wantNonEmpty: true,
		},
		{
			name: "bare claude basename without install path",
			chain: []ProcessInfo{
				{Name: "claude", Path: "/home/me/scripts/claude", PID: 1001, PPID: 1000},
				{Name: "bash", Path: "/bin/bash", PID: 1000, PPID: 999},
			},
			wantAgent:    "claude-code",
			wantHarness:  "claude-code",
			wantConf:     "medium", // path not in knownClaudePaths
			wantNonEmpty: true,
		},
		{
			name: "Cursor agent: python launched from Cursor.app",
			chain: []ProcessInfo{
				{Name: "python3", Path: "/usr/bin/python3", PID: 1500, PPID: 1499},
				{Name: "cursor-agent", Path: "/Applications/Cursor.app/Contents/Resources/cursor-agent", PID: 1499, PPID: 1400},
				{Name: "Cursor", Path: "/Applications/Cursor.app/Contents/MacOS/Cursor", PID: 1400, PPID: 1},
			},
			wantAgent:    "cursor",
			wantHarness:  "cursor.app",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "Cursor on Linux: cursor-agent ancestor",
			chain: []ProcessInfo{
				{Name: "node", Path: "/home/me/.cursor/bin/node", PID: 2000, PPID: 1999},
				{Name: "cursor-agent", Path: "/home/me/.cursor/bin/cursor-agent", PID: 1999, PPID: 1900},
			},
			wantAgent:    "cursor",
			wantHarness:  "cursor.app",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "VS Code via Code.app on macOS",
			chain: []ProcessInfo{
				{Name: "python3", Path: "/usr/bin/python3", PID: 3000, PPID: 2999},
				{
					Name: "node",
					Path: "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper",
					PID:  2999, PPID: 2900,
				},
			},
			wantAgent:    "vscode",
			wantHarness:  "vscode",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "VS Code via code binary on Linux",
			chain: []ProcessInfo{
				{Name: "node", Path: "/usr/share/code/code", PID: 3500, PPID: 3499},
				{Name: "code", Path: "/usr/share/code/code", PID: 3499, PPID: 3400},
			},
			wantAgent:    "vscode",
			wantHarness:  "vscode",
			wantConf:     "medium",
			wantNonEmpty: true,
		},
		{
			name: "Codex CLI via homebrew",
			chain: []ProcessInfo{
				{Name: "codex", Path: "/opt/homebrew/bin/codex", PID: 4001, PPID: 4000},
				{Name: "zsh", Path: "/bin/zsh", PID: 4000, PPID: 1},
			},
			wantAgent:    "codex",
			wantHarness:  "codex",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "Conductor wrapping Claude Code",
			chain: []ProcessInfo{
				{Name: "claude", Path: "/opt/homebrew/bin/claude", PID: 5002, PPID: 5001},
				{Name: "node", Path: "/usr/local/bin/node", PID: 5001, PPID: 5000},
				{Name: "conductor", Path: "/Applications/Conductor.app/Contents/MacOS/conductor", PID: 5000, PPID: 1},
			},
			wantAgent:    "conductor:claude-code",
			wantHarness:  "conductor",
			wantConf:     "medium",
			wantNonEmpty: true,
		},
		{
			name: "Conductor without identifiable child agent",
			chain: []ProcessInfo{
				{Name: "weirdtool", Path: "/usr/local/bin/weirdtool", PID: 5003, PPID: 5002},
				{Name: "conductor", Path: "/Applications/Conductor.app/Contents/MacOS/conductor", PID: 5002, PPID: 1},
			},
			wantAgent:    "conductor",
			wantHarness:  "conductor",
			wantConf:     "medium",
			wantNonEmpty: true,
		},
		{
			name: "psql with shell parent: human",
			chain: []ProcessInfo{
				{Name: "psql", Path: "/opt/homebrew/bin/psql", PID: 6000, PPID: 5999},
				{Name: "zsh", Path: "/bin/zsh", PID: 5999, PPID: 1},
			},
			wantAgent:    "human",
			wantHarness:  "psql",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "pg_dump: human",
			chain: []ProcessInfo{
				{Name: "pg_dump", Path: "/usr/bin/pg_dump", PID: 6100, PPID: 6099},
				{Name: "bash", Path: "/bin/bash", PID: 6099, PPID: 1},
			},
			wantAgent:    "human",
			wantHarness:  "psql",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "python script with no AI ancestor: human-script",
			chain: []ProcessInfo{
				{Name: "python3", Path: "/usr/bin/python3", PID: 7000, PPID: 6999},
				{Name: "bash", Path: "/bin/bash", PID: 6999, PPID: 1},
			},
			wantAgent:    "human-script",
			wantHarness:  "python3",
			wantConf:     "low",
			wantNonEmpty: true,
		},
		{
			name: "node script with no AI ancestor: human-script",
			chain: []ProcessInfo{
				{Name: "node", Path: "/usr/local/bin/node", PID: 7100, PPID: 7099},
				{Name: "zsh", Path: "/bin/zsh", PID: 7099, PPID: 1},
			},
			wantAgent:    "human-script",
			wantHarness:  "node",
			wantConf:     "low",
			wantNonEmpty: true,
		},
		{
			name: "vigil-bench is a known harness, not an agent",
			chain: []ProcessInfo{
				{Name: "vigil-bench", Path: "/Users/me/repos/vigil/proxy/bench/vigil-bench", PID: 8000, PPID: 1},
			},
			wantAgent:    "vigil-bench",
			wantHarness:  "vigil-bench",
			wantConf:     "high",
			wantNonEmpty: true,
		},
		{
			name: "unmatched leaf returns empty AgentName (anonymous fallback)",
			chain: []ProcessInfo{
				{Name: "obscure_tool", Path: "/usr/local/bin/obscure_tool", PID: 9000, PPID: 8999},
				{Name: "bash", Path: "/bin/bash", PID: 8999, PPID: 1},
			},
			wantAgent:    "",
			wantNonEmpty: false,
		},
		{
			name: "empty chain returns empty identity",
			chain: nil,
			wantNonEmpty: false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := MatchSignature(tc.chain)
			if got.Empty() != !tc.wantNonEmpty {
				t.Fatalf("Empty()=%v, want %v", got.Empty(), !tc.wantNonEmpty)
			}
			if got.AgentName != tc.wantAgent {
				t.Errorf("AgentName=%q, want %q", got.AgentName, tc.wantAgent)
			}
			if tc.wantHarness != "" && got.HarnessName != tc.wantHarness {
				t.Errorf("HarnessName=%q, want %q", got.HarnessName, tc.wantHarness)
			}
			if tc.wantConf != "" && got.Confidence != tc.wantConf {
				t.Errorf("Confidence=%q, want %q", got.Confidence, tc.wantConf)
			}
			// ProcessChain should always be populated when the chain
			// is non-empty (even on no-match) for debugging.
			if len(tc.chain) > 0 && len(got.ProcessChain) != len(tc.chain) {
				t.Errorf("ProcessChain length=%d, want %d", len(got.ProcessChain), len(tc.chain))
			}
		})
	}
}

// TestCursorAgentNameAloneTriggersDetection covers the case where
// the proxy attaches to a connection from a process whose binary
// path doesn't include "Cursor.app" but whose immediate parent is
// "cursor-agent" — common when Cursor invokes a script via a relayed
// shell.
func TestCursorAgentNameAloneTriggersDetection(t *testing.T) {
	t.Parallel()
	chain := []ProcessInfo{
		{Name: "psql", Path: "/opt/homebrew/bin/psql", PID: 100, PPID: 99},
		{Name: "cursor-agent", Path: "/home/me/.cache/cursor/cursor-agent", PID: 99, PPID: 1},
	}
	got := MatchSignature(chain)
	if got.AgentName != "cursor" {
		t.Fatalf("AgentName=%q, want \"cursor\"", got.AgentName)
	}
	if got.Confidence != "high" {
		t.Errorf("Confidence=%q, want \"high\"", got.Confidence)
	}
}

// TestConductorWalkOneLevelDeep verifies the conductor branch resolves
// the WRAPPED agent by re-running the matcher on the inner chain.
// Without this behavior the audit row would say "conductor" with no
// child differentiation, defeating the per-agent rate-limit bucket.
func TestConductorWalkOneLevelDeep(t *testing.T) {
	t.Parallel()
	chain := []ProcessInfo{
		{Name: "claude", Path: "/opt/homebrew/bin/claude"},
		{Name: "shell", Path: "/bin/zsh"},
		{Name: "conductor", Path: "/Applications/Conductor.app/Contents/MacOS/conductor"},
	}
	got := MatchSignature(chain)
	if got.AgentName != "conductor:claude-code" {
		t.Errorf("conductor wrapper should name child: got %q", got.AgentName)
	}
}

// TestProcessChainPathOverridesName guards against the simplest
// process-name-collision risk: a user binary named "claude" in a
// non-install location does NOT get attributed as Claude Code with
// "high" confidence.
func TestProcessChainPathOverridesName(t *testing.T) {
	t.Parallel()
	chain := []ProcessInfo{
		{Name: "claude", Path: "/tmp/random/claude", PID: 1, PPID: 0},
	}
	got := MatchSignature(chain)
	if got.AgentName != "claude-code" {
		t.Fatalf("AgentName=%q, want \"claude-code\"", got.AgentName)
	}
	if got.Confidence != "medium" {
		t.Errorf("Confidence=%q, want \"medium\" for non-install path", got.Confidence)
	}
}
