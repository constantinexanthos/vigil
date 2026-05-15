// Package processdetect implements Tier-1 (universal, no-opt-in) agent
// identity inference for the Postgres proxy.
//
// When a TCP connection arrives at vigil-proxy from localhost, the
// detector maps the remote (client) socket back to a PID, walks the
// PID's parent chain, then matches the resulting process chain against
// a data-driven signature map to infer which agent harness — Claude
// Code, Cursor, Codex, Conductor child, VS Code, custom script, raw
// human — is at the other end. The inferred identity is unsigned: it
// is good enough for grouping, rate-limit pool selection, audit
// attribution, and observability, but not good enough for enforcement.
// Signed Tier-2 identity via application_name=vigil:<token> always
// wins when present.
//
// Detection is best-effort: a connection that exits between Accept
// and DetectFromConn, a sandboxed agent we can't introspect, or a
// remote (non-localhost) source all return an empty DetectedIdentity
// rather than an error. The decision-tree in pgproxy treats empty as
// "fall through to anonymous"; errors are reserved for unexpected
// infrastructure failures (the syscall path itself failing, not
// "process disappeared").
//
// # Process-exited-between-accept-and-lookup
//
// We accept the race. If the process has exited by the time we look
// up the PID, the syscall fails with ESRCH (or /proc/<pid> is missing
// on Linux) and we return DetectedIdentity{} without error. We
// deliberately do NOT add a result cache — caching by (remoteAddr,
// time) would risk attributing a new connection to a previous owner
// of the same ephemeral port. The detector runs once per connection,
// synchronously, before the proxy advances to the StartupMessage; if
// it can't resolve in <50ms it returns empty and the connection
// continues without inferred identity.
//
// # Signature matching
//
// Matching is performed on the full process chain (basename + path +
// ancestors), not on basename alone. Multiple tools could be called
// "claude" or "python"; only the surrounding context — bundle paths,
// .app ancestors, parent harness names — disambiguates them. See
// signatures.go for the seed map.
package processdetect

import (
	"net"
	"time"
)

// DetectedIdentity is the result of a Tier-1 detection. AgentName is
// the canonical harness slug we use throughout the rest of the system
// ("claude-code", "cursor", "conductor:claude", "human", etc.).
// HarnessName is the immediate-parent harness when distinguishable —
// useful for telemetry and debugging but never load-bearing.
//
// Confidence drives downstream behavior: "high" attribution gets
// recorded on the audit row and used for per-agent buckets;
// "medium"/"low" is the same but logged as best-effort; "" means we
// could not identify anything and the caller should fall through to
// anonymous treatment.
//
// ProcessChain is the resolved process tree from the client process
// up to PID 1 (or the first process we cannot read), with the most
// recent (closest to the connection) first. It is preserved on the
// returned identity so --debug-detection can print it for tuning the
// signature map.
type DetectedIdentity struct {
	AgentName    string
	HarnessName  string
	Confidence   string
	ProcessChain []string
}

// Empty reports whether d carries no usable attribution. Callers use
// this to decide whether to fall through to anonymous treatment.
func (d DetectedIdentity) Empty() bool {
	return d.AgentName == ""
}

// Detector is the abstract surface pgproxy consults. The real impl is
// returned by New(); tests can substitute their own to inject scripted
// process chains without forking processes.
type Detector interface {
	// DetectFromConn returns the inferred identity of the process at
	// the other end of conn, or DetectedIdentity{} if undetectable.
	// Error is returned only on infrastructure faults (the syscall
	// itself failing in an unexpected way); a missing/exited process
	// is not an error.
	DetectFromConn(conn net.Conn) (DetectedIdentity, error)
}

// detector is the production implementation. It is platform-agnostic
// at this layer: socket→PID resolution and PID→process walking are
// delegated to platform-specific helpers in walk_darwin.go,
// walk_linux.go, walk_other.go (build tags).
type detector struct {
	// timeout caps each detection attempt so a slow lsof or hung
	// /proc read can't stall the proxy's accept path. 50ms is a soft
	// budget — on a healthy machine resolution returns in well under
	// a millisecond; the budget exists to bound the worst case.
	timeout time.Duration

	// debugLogger, if non-nil, receives one line per detection attempt
	// describing the resolved chain and confidence. Wired by main.go
	// when --debug-detection is set.
	debugLogger func(format string, args ...any)

	// resolveRemotePID is the platform's socket→PID resolver. Pulled
	// out as a function variable so tests can stub it without going
	// through the OS.
	resolveRemotePID func(localPort, remotePort int) (int, error)

	// walkProcessTree returns the process chain rooted at pid (most
	// recent first). Implementations are in walk_darwin.go etc.
	walkProcessTree func(pid int) ([]ProcessInfo, error)
}

// ProcessInfo carries the per-process facts the signature matcher
// needs: PID, parent PID, basename of the executable, full path when
// resolvable, and command-line args when distinguishable from the
// path (some tools live behind a generic interpreter and we want both
// "python" and "cursor-agent.py" visible).
type ProcessInfo struct {
	PID        int
	PPID       int
	Name       string // basename of the executable, e.g. "claude" or "python3"
	Path       string // absolute path, e.g. "/Applications/Cursor.app/Contents/MacOS/Cursor"
	CmdlineRaw string // full argv joined with spaces; "" when unreadable
}

// New returns a production Detector wired to the platform helpers.
// The returned Detector is safe for concurrent use; it owns no
// mutable state between calls.
func New() Detector {
	return &detector{
		timeout:          50 * time.Millisecond,
		resolveRemotePID: platformResolveRemotePID,
		walkProcessTree:  platformWalkProcessTree,
	}
}

// NewWithDebugLogger is like New but threads a logger that receives
// one line per detection attempt. Used by --debug-detection.
func NewWithDebugLogger(log func(format string, args ...any)) Detector {
	return &detector{
		timeout:          50 * time.Millisecond,
		debugLogger:      log,
		resolveRemotePID: platformResolveRemotePID,
		walkProcessTree:  platformWalkProcessTree,
	}
}

// DetectFromConn is the entry point used by pgproxy.
func (d *detector) DetectFromConn(conn net.Conn) (DetectedIdentity, error) {
	if d == nil {
		return DetectedIdentity{}, nil
	}

	remote, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		d.debugf("non-tcp remote addr %T → empty", conn.RemoteAddr())
		return DetectedIdentity{}, nil
	}
	// Non-localhost connections are not introspectable from the
	// proxy: there is no process tree on the other end of a remote
	// TCP socket. Document the boundary explicitly and return empty.
	if !isLoopback(remote.IP) {
		d.debugf("remote %s is not loopback → empty", remote.IP)
		return DetectedIdentity{}, nil
	}

	local, ok := conn.LocalAddr().(*net.TCPAddr)
	if !ok {
		return DetectedIdentity{}, nil
	}

	// Resolve the client-side PID by querying the kernel/proc for
	// who owns the TCP endpoint matching (localPort, remotePort).
	pid, err := d.resolveRemotePID(local.Port, remote.Port)
	if err != nil {
		d.debugf("resolveRemotePID(%d, %d) failed: %v → empty", local.Port, remote.Port, err)
		return DetectedIdentity{}, nil
	}
	if pid <= 0 {
		d.debugf("resolveRemotePID(%d, %d) returned pid=%d → empty", local.Port, remote.Port, pid)
		return DetectedIdentity{}, nil
	}

	chain, err := d.walkProcessTree(pid)
	if err != nil {
		d.debugf("walkProcessTree(%d) failed: %v → empty", pid, err)
		return DetectedIdentity{}, nil
	}
	if len(chain) == 0 {
		d.debugf("walkProcessTree(%d) returned empty chain", pid)
		return DetectedIdentity{}, nil
	}

	identity := MatchSignature(chain)
	d.debugf("detected pid=%d chain=%v → name=%q harness=%q conf=%q",
		pid, summarize(chain), identity.AgentName, identity.HarnessName, identity.Confidence)
	return identity, nil
}

func (d *detector) debugf(format string, args ...any) {
	if d == nil || d.debugLogger == nil {
		return
	}
	d.debugLogger(format, args...)
}

// summarize renders a process chain as a short slice of basenames so
// debug log lines stay readable; the full ProcessInfo is preserved on
// DetectedIdentity.ProcessChain for callers that need the detail.
func summarize(chain []ProcessInfo) []string {
	out := make([]string, len(chain))
	for i, p := range chain {
		out[i] = p.Name
	}
	return out
}

// isLoopback reports whether ip is the loopback (127.0.0.0/8 or ::1).
// We accept any 127.x.x.x address because some Postgres clients
// (especially under Docker-for-Mac shims) connect via 127.0.0.2 etc.
func isLoopback(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() {
		return true
	}
	// Net.IP.IsLoopback handles 127/8 and ::1, but we also want to
	// allow the bare ipv4-in-ipv6 form (::ffff:127.0.0.1) which some
	// stacks present. To4() canonicalizes that.
	if v4 := ip.To4(); v4 != nil && v4[0] == 127 {
		return true
	}
	return false
}
