// vigil-run wraps an arbitrary subprocess with a Vigil identity, so any
// Postgres traffic that subprocess emits through vigil-proxy carries a
// signed `application_name=vigil:<token>` header and shows up in the
// audit feed under the right agent.
//
// Usage:
//
//	vigil-run claude                                   # wraps Claude Code CLI
//	vigil-run codex                                    # wraps OpenAI Codex
//	vigil-run python my_script.py                      # wraps any command
//	vigil-run --principal=costa@example.com claude     # explicit principal
//	vigil-run --scopes=read,write claude               # explicit scopes
//	vigil-run --proxy=http://localhost:7878 claude     # custom proxy address
//	vigil-run --rotate claude                          # mint a fresh token
//	vigil-run --name=my-bot python script.py           # override agent_name
//
// Behavior:
//
//  1. Parse flags up to the first non-flag token (the wrapped command).
//     Everything after that token is the subprocess's argv — vigil-run
//     never tries to interpret it. This is critical: a user running
//     `vigil-run claude --some-flag` expects --some-flag to reach
//     claude, not vigil-run.
//
//  2. Look up the cached token in the OS keychain (or its fallback,
//     see keychain.go). Cache key is `<principal>:<agent_name>`.
//
//  3. If the cache misses, --rotate is set, or the cached token
//     expires within 1 hour, POST /identities to vigil-proxy to mint
//     a fresh one. Cache the result.
//
//  4. exec the wrapped command with VIGIL_TOKEN=<token> in its env.
//     We use syscall.Exec on Unix so the wrapper PID is replaced —
//     signal handling stays clean, and process-introspection (the
//     v0.1.0e Tier-1 work) sees the real binary, not "vigil-run".
//
// Errors:
//
//	exit 2: vigil-proxy unreachable on --proxy.
//	exit 3: invalid flag / missing wrapped command.
//	exec error code: bubbled up from the wrapped command.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Version is overridden at build time via -ldflags. The default reflects
// the in-tree code release. Bump this in lockstep with vigil-proxy
// when shipping a release.
var Version = "v0.1.0e-dev"

// defaultProxyAddr is the URL vigil-run uses when --proxy is not
// specified and VIGIL_PROXY_URL is not in the environment. Matches the
// proxy's default --addr.
const defaultProxyAddr = "http://localhost:7878"

// rotateGracePeriod is how close to expiration a cached token can be
// before we treat it as a miss and mint a fresh one. One hour leaves
// room for a long-running session (`vigil-run claude` overnight) that
// would otherwise hit expiration mid-day.
const rotateGracePeriod = 1 * time.Hour

// flags holds the parsed CLI arguments. Pulled into a struct so tests
// can construct it directly without round-tripping through flag.Parse.
type flags struct {
	Principal string
	Scopes    []string
	ProxyURL  string
	AgentName string
	Rotate    bool
	Help      bool
	Version   bool

	// Args is the wrapped command + its args. Args[0] is the binary
	// to exec; Args[1:] are passed through verbatim.
	Args []string
}

// helpText is the output of `vigil-run --help`. Kept simple — the
// per-harness docs go deeper.
const helpText = `vigil-run — wrap any subprocess with a Vigil identity.

Usage:
  vigil-run [flags] <command> [command-args...]

Examples:
  vigil-run claude
  vigil-run python my_script.py
  vigil-run --principal=alice@example.com claude
  vigil-run --scopes=read,write claude
  vigil-run --proxy=http://localhost:7878 claude
  vigil-run --rotate claude

Flags:
  --principal <email>   Human principal the wrapped agent acts on behalf of.
                        Defaults to $USER@$HOSTNAME (or "user@local" if those
                        are unset).
  --scopes <list>       Comma-separated scope list. Default: "read,write".
  --proxy <url>         vigil-proxy HTTP base URL. Default: VIGIL_PROXY_URL
                        env, or http://localhost:7878.
  --name <name>         Override the auto-detected agent_name. Default is
                        derived from the wrapped command's basename
                        (claude → claude-code, codex → codex, otherwise the
                        binary's basename).
  --rotate              Mint a fresh token, ignoring any cached entry.
  --help                Print this help text.
  --version             Print version and exit.
`

func main() {
	os.Exit(run(os.Args[1:], os.Stderr))
}

// run is the testable entry point. It returns the exit code instead of
// calling os.Exit so tests can assert behavior. stderr is wired
// explicitly so tests capture diagnostic output.
func run(argv []string, stderr io.Writer) int {
	f, err := parseFlags(argv)
	if err != nil {
		fmt.Fprintln(stderr, "vigil-run:", err)
		fmt.Fprintln(stderr, "  run `vigil-run --help` for usage")
		return 3
	}
	if f.Help {
		fmt.Fprint(stderr, helpText)
		return 0
	}
	if f.Version {
		fmt.Fprintf(stderr, "vigil-run %s\n", Version)
		return 0
	}
	if len(f.Args) == 0 {
		fmt.Fprintln(stderr, "vigil-run: missing wrapped command")
		fmt.Fprintln(stderr, "  run `vigil-run --help` for usage")
		return 3
	}

	// Auto-derive agent_name from the binary basename if not set.
	if f.AgentName == "" {
		f.AgentName = resolveAgentName(f.Args[0])
	}

	// Resolve identity (cache hit, refresh, or fresh mint).
	store := newRealStore()
	token, err := resolveIdentity(context.Background(), f, store, http.DefaultClient)
	if err != nil {
		// resolveIdentity already formats actionable errors; the
		// exit code carries the policy (2 = proxy unreachable).
		fmt.Fprintln(stderr, "vigil-run:", err)
		if isProxyUnreachable(err) {
			return 2
		}
		return 1
	}

	// Build the env the subprocess sees: parent env minus any
	// stale VIGIL_TOKEN, plus our fresh one.
	env := scrubAndInjectEnv(os.Environ(), token)

	// Look up the binary on PATH; syscall.Exec needs an absolute path
	// (or a path that resolves relative to cwd). Calling LookPath
	// ourselves lets us print a friendly error rather than the cryptic
	// "no such file or directory" you'd get from execve.
	bin, err := exec.LookPath(f.Args[0])
	if err != nil {
		fmt.Fprintf(stderr, "vigil-run: command not found: %s\n", f.Args[0])
		return 127
	}

	if err := execWrapped(bin, f.Args, env); err != nil {
		fmt.Fprintln(stderr, "vigil-run: exec failed:", err)
		return 126
	}
	// Unreachable on Unix — syscall.Exec replaces the process.
	return 0
}

// parseFlags parses vigil-run's arguments. Critical: we stop at the
// first non-flag token. Everything after that goes to the wrapped
// command, including tokens that *look* like flags (--some-flag,
// --help, etc). This matches how `env`, `time`, `nohup`, and friends
// parse their arguments, and it's what users expect.
func parseFlags(argv []string) (flags, error) {
	f := flags{}
	i := 0
	for i < len(argv) {
		a := argv[i]

		// First non-flag token ends our parsing.
		if !strings.HasPrefix(a, "-") {
			f.Args = argv[i:]
			return f, nil
		}

		// "--" explicitly ends our parsing.
		if a == "--" {
			f.Args = argv[i+1:]
			return f, nil
		}

		// Single-letter shorthand we accept. Cheap.
		if a == "-h" {
			f.Help = true
			i++
			continue
		}

		// Long form. We accept both --foo=bar and --foo bar; the
		// former is unambiguous, the latter requires we know that
		// foo takes a value.
		key, val, hasVal := strings.Cut(strings.TrimPrefix(a, "-"), "=")
		key = strings.TrimPrefix(key, "-") // accept both - and --

		switch key {
		case "principal":
			if !hasVal {
				if i+1 >= len(argv) {
					return f, fmt.Errorf("flag --principal requires a value")
				}
				val = argv[i+1]
				i++
			}
			f.Principal = val
		case "scopes":
			if !hasVal {
				if i+1 >= len(argv) {
					return f, fmt.Errorf("flag --scopes requires a value")
				}
				val = argv[i+1]
				i++
			}
			f.Scopes = splitCsv(val)
		case "proxy":
			if !hasVal {
				if i+1 >= len(argv) {
					return f, fmt.Errorf("flag --proxy requires a value")
				}
				val = argv[i+1]
				i++
			}
			f.ProxyURL = val
		case "name":
			if !hasVal {
				if i+1 >= len(argv) {
					return f, fmt.Errorf("flag --name requires a value")
				}
				val = argv[i+1]
				i++
			}
			f.AgentName = val
		case "rotate":
			f.Rotate = true
		case "help":
			f.Help = true
		case "version":
			f.Version = true
		default:
			return f, fmt.Errorf("unknown flag: %s", a)
		}
		i++
	}
	// No wrapped command — caller will surface this if it matters
	// (e.g. --help is also flag-only).
	return f, nil
}

// splitCsv splits "read,write,admin" into ["read","write","admin"],
// trimming whitespace and empty entries.
func splitCsv(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// resolveAgentName maps the wrapped binary name to a canonical Vigil
// agent_name. The mapping handles the harness CLIs explicitly so the
// dashboard's per-agent grouping comes out clean (`claude-code` instead
// of `claude`); everything else falls back to the basename.
func resolveAgentName(cmd string) string {
	base := filepath.Base(cmd)
	// Strip platform extensions (rare on Unix, but cheap).
	base = strings.TrimSuffix(base, ".exe")
	switch base {
	case "claude":
		return "claude-code"
	case "codex":
		return "codex"
	case "cursor", "cursor-agent":
		return "cursor"
	case "code", "code-insiders":
		return "vscode"
	default:
		return base
	}
}

// resolveIdentity returns the token string to inject into the
// subprocess env. It either pulls from the keychain cache (when valid
// and not --rotate) or mints a fresh one via the proxy HTTP API.
func resolveIdentity(ctx context.Context, f flags, store tokenStore, client *http.Client) (string, error) {
	principal := f.Principal
	if principal == "" {
		principal = defaultPrincipal()
	}
	scopes := f.Scopes
	if len(scopes) == 0 {
		scopes = []string{"read", "write"}
	}

	// Cache lookup (skipped on --rotate).
	if !f.Rotate {
		if t, hit, err := store.get(principal, f.AgentName); err == nil && hit {
			if t.Token != "" && time.Until(t.ExpiresAt) > rotateGracePeriod {
				return t.Token, nil
			}
		}
	} else {
		_ = store.delete(principal, f.AgentName)
	}

	// Mint via the proxy. 24-hour TTL is what the proxy defaults to
	// when no TTL is supplied.
	proxyURL := f.ProxyURL
	if proxyURL == "" {
		proxyURL = os.Getenv("VIGIL_PROXY_URL")
		if proxyURL == "" {
			proxyURL = defaultProxyAddr
		}
	}
	tok, exp, err := mintIdentity(ctx, client, proxyURL, identityReq{
		AgentName: f.AgentName,
		Principal: principal,
		Scopes:    scopes,
	})
	if err != nil {
		return "", err
	}
	_ = store.set(principal, f.AgentName, cachedToken{Token: tok, ExpiresAt: exp})
	return tok, nil
}

// identityReq mirrors the JSON request body of POST /identities.
// Embedded here so vigil-run doesn't need to import the proxy package
// (which would drag in modernc.org/sqlite + the full keystore graph).
type identityReq struct {
	AgentName string   `json:"agent_name"`
	Principal string   `json:"principal"`
	Scopes    []string `json:"scopes"`
	TTL       string   `json:"ttl,omitempty"`
}

// identityResp mirrors the JSON response body of POST /identities.
type identityResp struct {
	Identity struct {
		ID        string    `json:"id"`
		AgentName string    `json:"agent_name"`
		Principal string    `json:"principal"`
		Scopes    []string  `json:"scopes"`
		PublicKey string    `json:"public_key"`
		IssuedAt  time.Time `json:"issued_at"`
		ExpiresAt time.Time `json:"expires_at"`
	} `json:"identity"`
	Token struct {
		ID        string `json:"id"`
		Token     string `json:"token"`
		PublicKey string `json:"publicKey"`
	} `json:"token"`
}

// proxyUnreachableErr is the sentinel returned when we can't reach
// vigil-proxy. main.go uses errors.Is to translate it into exit code 2
// without coupling to the underlying syscall error.
type proxyUnreachableErr struct{ wrapped error }

func (e *proxyUnreachableErr) Error() string {
	return fmt.Sprintf(
		"vigil-proxy is not running. Start it with `vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432` and try again. (underlying: %v)",
		e.wrapped,
	)
}
func (e *proxyUnreachableErr) Unwrap() error { return e.wrapped }

func isProxyUnreachable(err error) bool {
	var p *proxyUnreachableErr
	return errors.As(err, &p)
}

// mintIdentity POSTs to /identities and returns (token, expiresAt). On
// connection errors we wrap with proxyUnreachableErr so main.go can
// map it to exit 2 + a friendly hint.
func mintIdentity(ctx context.Context, client *http.Client, base string, req identityReq) (string, time.Time, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("marshal identity request: %w", err)
	}

	endpoint, err := url.JoinPath(base, "/identities")
	if err != nil {
		return "", time.Time{}, fmt.Errorf("build identities URL from %q: %w", base, err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("new request: %w", err)
	}
	httpReq.Header.Set("content-type", "application/json")

	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		var netErr *net.OpError
		if errors.As(err, &netErr) || strings.Contains(err.Error(), "connection refused") {
			return "", time.Time{}, &proxyUnreachableErr{wrapped: err}
		}
		return "", time.Time{}, &proxyUnreachableErr{wrapped: err}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", time.Time{}, fmt.Errorf("identity issue failed: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var parsed identityResp
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", time.Time{}, fmt.Errorf("decode identity response: %w", err)
	}
	if parsed.Token.Token == "" {
		return "", time.Time{}, fmt.Errorf("identity response missing token")
	}
	exp := parsed.Identity.ExpiresAt
	if exp.IsZero() {
		// Proxy didn't return ExpiresAt? Treat as 24h from now to
		// keep the cache useful but conservative.
		exp = time.Now().Add(24 * time.Hour)
	}
	return parsed.Token.Token, exp, nil
}

// defaultPrincipal derives a sensible default principal when --principal
// is not specified. Matches the pattern most local dev workflows use:
// `<unix-user>@<hostname>`. Returns "user@local" if we can't read
// either.
func defaultPrincipal() string {
	user := os.Getenv("USER")
	if user == "" {
		user = os.Getenv("USERNAME") // Windows
	}
	if user == "" {
		user = "user"
	}
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "local"
	}
	return user + "@" + host
}

// scrubAndInjectEnv produces the env vector the subprocess should see.
// It copies parent env minus any existing VIGIL_TOKEN (so a user who
// happened to have VIGIL_TOKEN set in their shell doesn't see two
// conflicting values), then appends our fresh one.
//
// We intentionally do NOT strip other VIGIL_* env vars — operators
// may be threading VIGIL_PROXY_URL or VIGIL_DEBUG through on purpose.
func scrubAndInjectEnv(parent []string, token string) []string {
	out := make([]string, 0, len(parent)+1)
	for _, kv := range parent {
		if strings.HasPrefix(kv, "VIGIL_TOKEN=") {
			continue
		}
		out = append(out, kv)
	}
	out = append(out, "VIGIL_TOKEN="+token)
	return out
}

// execWrapped replaces the current process with the wrapped command.
// On Unix we use syscall.Exec so the wrapper PID is reused — important
// for clean signal handling AND so the upcoming v0.1.0e Tier-1
// process introspection sees the real command in /proc, not
// "vigil-run". On Windows (no syscall.Exec equivalent) we fall back
// to exec.Cmd and forward stdout/stderr.
//
// On Windows this returns after the subprocess exits, propagating the
// exit code via os.Exit; on Unix it never returns on success.
func execWrapped(bin string, args, env []string) error {
	return platformExec(bin, args, env)
}
