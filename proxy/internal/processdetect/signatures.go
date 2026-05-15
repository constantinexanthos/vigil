// signatures.go is the data-driven harness signature map for Tier-1
// detection. Given a resolved process chain (leaf-first), MatchSignature
// walks the chain looking for the earliest definitive match.
//
// Matching is path + ancestors aware, not basename alone. A process
// named "claude" inside `/Applications/Cursor.app/...` is Cursor,
// not Claude Code; a `python` whose parent is `cursor-agent` is the
// Cursor harness, not a human script. The signature table encodes
// these disambiguations.
//
// Confidence semantics:
//
//   - "high":   we are confident enough to put this on the audit row
//     and use it as a per-agent bucket key. Reserved for cases where
//     the chain has a definitive marker (a known binary name in a
//     known location, or a known harness ancestor).
//   - "medium": we have a plausible attribution but it could be the
//     wrong harness for a hand-crafted setup. Same downstream
//     treatment as "high" for v0.1.0e; the score is preserved on the
//     audit row so future tuning can quote a confidence-conditional
//     detection rate.
//   - "low":    a generic interpreter (python/node/ruby) without an
//     AI ancestor. We attribute as "human-script" because the
//     alternative is anonymous, and "human-script" is strictly more
//     informative than null on the operator UI.
//
// Tuning workflow: when --debug-detection is on, each missed
// detection prints its full chain to stderr. Costa runs his real
// agents through vigil-proxy, copies the chains, and adds rules
// here. The detection rate is the inverse of "how many lines in
// the dogfood transcript still match the unknown bucket?"
//
// Process-name collisions: we deliberately do NOT match on basename
// alone for any AI agent. A directory-path or argv check is required
// for "high" confidence. The exception is `psql`/`pg_dump` (no
// AI overlap exists) and `vigil-bench` (our own harness).

package processdetect

import "strings"

// MatchSignature inspects a leaf-first process chain and returns the
// inferred DetectedIdentity. Empty AgentName means we could not
// attribute — the caller falls through to anonymous treatment.
func MatchSignature(chain []ProcessInfo) DetectedIdentity {
	if len(chain) == 0 {
		return DetectedIdentity{}
	}

	processChain := chainBasenames(chain)

	// Conductor wraps real harnesses inside per-agent worktrees. The
	// signature is the presence of "conductor" in any ancestor's
	// path. We resolve the child by re-running the matcher on the
	// chain with the conductor frame elided; if that returns a known
	// agent, we report "conductor:<child>", else plain "conductor".
	if ci, found := findConductorAncestor(chain); found {
		child := matchInner(chain, ci)
		name := "conductor"
		if !child.Empty() {
			name = "conductor:" + child.AgentName
		}
		return DetectedIdentity{
			AgentName:    name,
			HarnessName:  "conductor",
			Confidence:   "medium",
			ProcessChain: processChain,
		}
	}

	// Cursor/VS Code: detect by .app ancestor. The leaf may be
	// `python`, `node`, `cursor-agent`, etc.; the disambiguating
	// signal is somewhere in the path of an ancestor.
	if hasAncestorPath(chain, "/Cursor.app/") || hasAncestorPath(chain, "/Cursor.app ") || hasAncestorName(chain, "cursor-agent") {
		return DetectedIdentity{
			AgentName:    "cursor",
			HarnessName:  "cursor.app",
			Confidence:   "high",
			ProcessChain: processChain,
		}
	}
	if hasAncestorPath(chain, "/Visual Studio Code.app/") ||
		hasAncestorPath(chain, "/Code.app/") ||
		hasAncestorPath(chain, "/Code - Insiders.app/") {
		return DetectedIdentity{
			AgentName:    "vscode",
			HarnessName:  "vscode",
			Confidence:   "high",
			ProcessChain: processChain,
		}
	}
	// VS Code on Linux: the binary is `code` (or `code-insiders`).
	// Match on name; a bare `code` user-shell command is unlikely
	// enough that this is acceptable false-positive risk for "high".
	if hasAncestorName(chain, "code") || hasAncestorName(chain, "code-insiders") {
		return DetectedIdentity{
			AgentName:    "vscode",
			HarnessName:  "vscode",
			Confidence:   "medium",
			ProcessChain: processChain,
		}
	}

	// Claude Code CLI: the official Anthropic binary is "claude". We
	// require either the canonical install path (homebrew /opt/
	// homebrew/bin/claude, /usr/local/bin/claude, ~/.npm-packages/),
	// or an argv that includes claude-specific flags. Naked "claude"
	// basename alone is "medium" confidence (could be a user script
	// named claude); pathed match is "high".
	if isClaudeCode(chain) {
		conf := "high"
		// If we matched only on basename without a known install
		// path, downgrade to medium.
		if !chainHasInstallSignal(chain, "claude", knownClaudePaths, knownClaudeFragments) {
			conf = "medium"
		}
		return DetectedIdentity{
			AgentName:    "claude-code",
			HarnessName:  "claude-code",
			Confidence:   conf,
			ProcessChain: processChain,
		}
	}

	// Codex CLI: OpenAI's harness binary is "codex". Same
	// pattern as Claude Code.
	if isCodexCLI(chain) {
		conf := "high"
		if !chainHasInstallSignal(chain, "codex", knownCodexPaths, knownCodexFragments) {
			conf = "medium"
		}
		return DetectedIdentity{
			AgentName:    "codex",
			HarnessName:  "codex",
			Confidence:   conf,
			ProcessChain: processChain,
		}
	}

	// vigil-bench: our own benchmark harness. We detect it so dogfood
	// metrics can subtract bench traffic from the detection-rate
	// denominator. NOT a real agent.
	if hasAncestorName(chain, "vigil-bench") {
		return DetectedIdentity{
			AgentName:    "vigil-bench",
			HarnessName:  "vigil-bench",
			Confidence:   "high",
			ProcessChain: processChain,
		}
	}

	// Direct human tools. psql/pg_dump/pgbench are operator commands;
	// when they have no AI ancestor in the chain we attribute as
	// "human" with high confidence.
	if leafIsAny(chain, humanPostgresTools) {
		return DetectedIdentity{
			AgentName:    "human",
			HarnessName:  "psql",
			Confidence:   "high",
			ProcessChain: processChain,
		}
	}

	// Generic interpreter scripts with no AI ancestor: "human-script".
	// This is strictly more informative than anonymous; lifts the
	// floor of the detection rate without claiming agent identity.
	if leafIsAny(chain, scriptInterpreters) {
		return DetectedIdentity{
			AgentName:    "human-script",
			HarnessName:  chain[0].Name,
			Confidence:   "low",
			ProcessChain: processChain,
		}
	}

	// Unmatched: leave AgentName empty so the caller treats this as
	// anonymous. The chain is preserved on the (empty) return for
	// callers that want to log it for signature tuning.
	return DetectedIdentity{
		ProcessChain: processChain,
	}
}

// matchInner is the recursive helper used by the conductor branch.
// Given a chain and the index of the conductor frame, it re-runs
// MatchSignature on the chain SUB-slice below conductor — i.e.
// {chain[0:conductorIdx]} — to identify the agent conductor wraps.
//
// We can't just slice and call MatchSignature directly because the
// inner-chain might match conductor again (nested conductor invocations
// are rare but possible). We mask future conductor frames by
// truncating at the conductor index.
func matchInner(chain []ProcessInfo, conductorIdx int) DetectedIdentity {
	if conductorIdx <= 0 {
		return DetectedIdentity{}
	}
	inner := chain[:conductorIdx]
	return MatchSignature(inner)
}

// chainBasenames returns the basename slice of a process chain, used
// to populate DetectedIdentity.ProcessChain for debugging.
func chainBasenames(chain []ProcessInfo) []string {
	out := make([]string, len(chain))
	for i, p := range chain {
		out[i] = p.Name
	}
	return out
}

// findConductorAncestor returns (index, true) if any ancestor's path
// or basename contains "conductor". Conductor binaries can live at
// non-standard paths depending on install method; we accept either
// signal. Leaf-first chain, so a larger index = deeper ancestor.
func findConductorAncestor(chain []ProcessInfo) (int, bool) {
	for i, p := range chain {
		path := strings.ToLower(p.Path)
		name := strings.ToLower(p.Name)
		// The "conductor" name is generic enough that we require
		// either the official .app suffix, the conductor.dev install
		// dir, or an obvious binary name match. (Postgres has a
		// `conductor` extension; we don't want to mis-match a hand-
		// rolled cluster tool of the same name.)
		if strings.Contains(path, "/conductor.app/") ||
			strings.Contains(path, "/conductor.dev/") ||
			strings.Contains(path, "conductor/conductor") ||
			(name == "conductor" && i > 0) {
			return i, true
		}
	}
	return 0, false
}

// hasAncestorPath returns true if any ancestor's full path contains
// the given substring. Case-sensitive — paths on macOS are typically
// case-preserved.
func hasAncestorPath(chain []ProcessInfo, substr string) bool {
	for _, p := range chain {
		if strings.Contains(p.Path, substr) {
			return true
		}
	}
	return false
}

// hasAncestorName returns true if any ancestor's basename matches
// exactly (case-insensitive). Used for harness disambiguators like
// `cursor-agent` and `code` where the binary name is the signal.
func hasAncestorName(chain []ProcessInfo, name string) bool {
	target := strings.ToLower(name)
	for _, p := range chain {
		if strings.ToLower(p.Name) == target {
			return true
		}
	}
	return false
}

// isClaudeCode reports whether the chain looks like the Anthropic
// Claude Code CLI. Multiple shapes:
//
//   - leaf or near-leaf basename is "claude"
//   - basename is "node" + cmdline contains "/claude" or "@anthropic-ai/claude-code"
//   - any ancestor path contains "/anthropic" or "@anthropic-ai"
func isClaudeCode(chain []ProcessInfo) bool {
	for _, p := range chain {
		name := strings.ToLower(p.Name)
		if name == "claude" {
			return true
		}
		// Node-hosted shim. Claude Code's npm distribution runs as
		// `node /path/to/cli.js`; the cli.js path includes the
		// package name.
		cmd := p.CmdlineRaw
		if strings.Contains(cmd, "@anthropic-ai/claude-code") ||
			strings.Contains(cmd, "/claude-code/") ||
			strings.HasSuffix(cmd, "/claude") {
			return true
		}
	}
	return false
}

// isCodexCLI reports whether the chain looks like OpenAI's Codex
// CLI. Mirrors isClaudeCode's shape.
func isCodexCLI(chain []ProcessInfo) bool {
	for _, p := range chain {
		name := strings.ToLower(p.Name)
		if name == "codex" {
			return true
		}
		cmd := p.CmdlineRaw
		if strings.Contains(cmd, "@openai/codex") ||
			strings.Contains(cmd, "/codex-cli/") {
			return true
		}
	}
	return false
}

// chainHasInstallSignal returns true if SOME ancestor's path matches
// either an exact-prefix from `prefixes` or contains any of the
// substrings in `fragments`. The path-prefix check looks for the
// binary at canonical install locations (e.g. /opt/homebrew/bin/);
// the fragment check looks for path tells that survive across user
// homedirs (e.g. /.npm-packages/, /@anthropic-ai/claude-code/).
//
// We also let the cmdline raw string contribute to the fragment
// check — node-hosted CLIs put the package path in argv, not in the
// executable path of the leaf process.
//
// Used to upgrade match confidence from "medium" to "high" for AI
// harness binaries: only when we see the binary at a known location
// (or under a known npm/volta/nvm path fragment) do we claim high
// confidence.
func chainHasInstallSignal(chain []ProcessInfo, basename string, prefixes, fragments []string) bool {
	for _, p := range chain {
		nameMatches := strings.EqualFold(p.Name, basename)
		// Prefix check: only relevant when the binary name matches —
		// "/opt/homebrew/bin/claude" tells us only that this is
		// claude, not that a different leaf binary happened to live
		// near a claude install.
		if nameMatches {
			for _, pref := range prefixes {
				if strings.HasPrefix(p.Path, pref) {
					return true
				}
			}
		}
		// Fragment check: looks for tells in path OR cmdline. The
		// fragments are package-path-shaped, so they're unique
		// enough to apply even when basename doesn't match (a node
		// process running /home/me/.npm-packages/lib/claude-code/cli.js
		// is still claude-code).
		hay := p.Path + " " + p.CmdlineRaw
		for _, frag := range fragments {
			if strings.Contains(hay, frag) {
				return true
			}
		}
	}
	return false
}

// leafIsAny returns true if the leaf (chain[0]) has a basename
// matching one of the candidates (case-insensitive).
func leafIsAny(chain []ProcessInfo, candidates []string) bool {
	if len(chain) == 0 {
		return false
	}
	leaf := strings.ToLower(chain[0].Name)
	for _, c := range candidates {
		if leaf == c {
			return true
		}
	}
	return false
}

// knownClaudePaths is the seed list of canonical install locations
// for the `claude` binary. Add to this when dogfood reveals new
// installs — npm-global, npx cache, custom prefixes, etc.
//
// chainHasInstallPath does a prefix check; the entries below must
// be specific enough that an unrelated /tmp/random/claude does NOT
// match. We test that boundary in TestProcessChainPathOverridesName.
var knownClaudePaths = []string{
	"/opt/homebrew/bin/claude",
	"/usr/local/bin/claude",
	"/usr/bin/claude",
}

// knownClaudeFragments is a list of path SUBSTRINGS (not prefixes)
// that signal an official Claude Code install. These are absolute-
// path fragments that show up inside per-user install locations
// regardless of $HOME (homebrew prefix var, npm prefix, etc.).
var knownClaudeFragments = []string{
	"/.local/bin/claude",
	"/.npm-packages/",
	"/.npm/_npx/",
	"/.volta/bin/",
	"/.nvm/versions/node/",
	"/@anthropic-ai/claude-code/",
}

// knownCodexPaths mirrors knownClaudePaths for OpenAI Codex CLI.
var knownCodexPaths = []string{
	"/opt/homebrew/bin/codex",
	"/usr/local/bin/codex",
	"/usr/bin/codex",
}

// knownCodexFragments mirrors knownClaudeFragments for Codex.
var knownCodexFragments = []string{
	"/.local/bin/codex",
	"/.npm-packages/",
	"/.npm/_npx/",
	"/.volta/bin/",
	"/.nvm/versions/node/",
	"/@openai/codex/",
}

// humanPostgresTools is the set of leaf-basenames we treat as
// "human" (operator) when no AI harness ancestor is detected.
var humanPostgresTools = []string{
	"psql", "pg_dump", "pgbench", "pgcli", "pg_restore",
}

// scriptInterpreters is the set of leaf-basenames that on their own
// (no AI ancestor) get attributed as "human-script". The list
// covers the languages users routinely write ad-hoc Postgres
// clients in. Adding more is harmless; mis-attributing a "ruby"
// leaf to "human-script" rather than "ruby script run by Claude
// Code" is acceptable because the chain walk would have found the
// claude ancestor first if present.
var scriptInterpreters = []string{
	"python", "python3", "python2",
	"node", "deno", "bun",
	"ruby", "perl",
	"go", "main", // bare `./main` is a common dev pattern
	"java",
	"dotnet",
}
