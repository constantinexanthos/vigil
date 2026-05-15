package processdetect

import (
	"errors"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

// stubConn implements net.Conn enough to drive DetectFromConn. We
// only consult RemoteAddr and LocalAddr in the detector.
type stubConn struct {
	remote net.Addr
	local  net.Addr
}

func (c stubConn) Read([]byte) (int, error)         { return 0, nil }
func (c stubConn) Write([]byte) (int, error)        { return 0, nil }
func (c stubConn) Close() error                     { return nil }
func (c stubConn) LocalAddr() net.Addr              { return c.local }
func (c stubConn) RemoteAddr() net.Addr             { return c.remote }
func (c stubConn) SetDeadline(time.Time) error      { return nil }
func (c stubConn) SetReadDeadline(time.Time) error  { return nil }
func (c stubConn) SetWriteDeadline(time.Time) error { return nil }

// tcpConn returns a stubConn with the given local and remote port on
// 127.0.0.1.
func tcpConn(localPort, remotePort int) stubConn {
	return stubConn{
		local:  &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: localPort},
		remote: &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: remotePort},
	}
}

// TestDetectorHappyPath drives the full detector with stubbed
// resolveRemotePID + walkProcessTree to confirm signature wiring.
func TestDetectorHappyPath(t *testing.T) {
	t.Parallel()
	d := &detector{
		timeout: 50 * time.Millisecond,
		resolveRemotePID: func(local, remote int) (int, error) {
			if local != 7432 || remote != 54321 {
				return 0, fmt.Errorf("unexpected ports: local=%d remote=%d", local, remote)
			}
			return 12345, nil
		},
		walkProcessTree: func(pid int) ([]ProcessInfo, error) {
			if pid != 12345 {
				return nil, fmt.Errorf("unexpected pid %d", pid)
			}
			return []ProcessInfo{
				{Name: "claude", Path: "/opt/homebrew/bin/claude", PID: 12345, PPID: 1},
			}, nil
		},
	}

	got, err := d.DetectFromConn(tcpConn(7432, 54321))
	if err != nil {
		t.Fatalf("DetectFromConn: %v", err)
	}
	if got.AgentName != "claude-code" {
		t.Errorf("AgentName=%q, want \"claude-code\"", got.AgentName)
	}
	if got.Confidence != "high" {
		t.Errorf("Confidence=%q, want \"high\"", got.Confidence)
	}
}

// TestDetectorReturnsEmptyOnResolveFailure verifies the resolver
// failing is non-fatal: the detector returns DetectedIdentity{}
// (Empty()=true) and nil error, so pgproxy falls through to
// anonymous attribution.
func TestDetectorReturnsEmptyOnResolveFailure(t *testing.T) {
	t.Parallel()
	d := &detector{
		resolveRemotePID: func(_, _ int) (int, error) {
			return 0, errors.New("lsof: process exited")
		},
		walkProcessTree: func(int) ([]ProcessInfo, error) {
			t.Fatalf("walkProcessTree should not be called when resolve fails")
			return nil, nil
		},
	}

	got, err := d.DetectFromConn(tcpConn(7432, 54321))
	if err != nil {
		t.Errorf("DetectFromConn returned error %v; want nil (best-effort)", err)
	}
	if !got.Empty() {
		t.Errorf("DetectFromConn returned non-empty identity %v; want empty", got)
	}
}

// TestDetectorReturnsEmptyOnZeroPID covers the case where the
// resolver legitimately reports "no process owns this socket"
// (returns 0 with nil error — typical when the process has exited
// between accept and lookup).
func TestDetectorReturnsEmptyOnZeroPID(t *testing.T) {
	t.Parallel()
	d := &detector{
		resolveRemotePID: func(_, _ int) (int, error) {
			return 0, nil
		},
		walkProcessTree: func(int) ([]ProcessInfo, error) {
			t.Fatalf("walkProcessTree should not be called when pid=0")
			return nil, nil
		},
	}

	got, err := d.DetectFromConn(tcpConn(7432, 54321))
	if err != nil {
		t.Errorf("DetectFromConn error %v; want nil", err)
	}
	if !got.Empty() {
		t.Errorf("non-empty identity for pid=0: %v", got)
	}
}

// TestDetectorReturnsEmptyOnNonLoopback verifies remote (network)
// connections are not introspected. The detector returns empty with
// nil error and we never invoke the platform helpers.
func TestDetectorReturnsEmptyOnNonLoopback(t *testing.T) {
	t.Parallel()
	d := &detector{
		resolveRemotePID: func(_, _ int) (int, error) {
			t.Fatalf("resolveRemotePID should not be called for non-loopback")
			return 0, nil
		},
	}

	conn := stubConn{
		local:  &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 7432},
		remote: &net.TCPAddr{IP: net.ParseIP("10.0.0.5"), Port: 54321},
	}
	got, err := d.DetectFromConn(conn)
	if err != nil {
		t.Errorf("unexpected error %v", err)
	}
	if !got.Empty() {
		t.Errorf("non-empty identity for non-loopback: %v", got)
	}
}

// TestDetectorEmptyChainTreatedAsUndetectable covers the "process
// exists but introspection failed mid-walk" case: the leaf resolver
// succeeded but the chain came back empty. Behaviour: return empty
// gracefully.
func TestDetectorEmptyChainTreatedAsUndetectable(t *testing.T) {
	t.Parallel()
	d := &detector{
		resolveRemotePID: func(_, _ int) (int, error) {
			return 42, nil
		},
		walkProcessTree: func(int) ([]ProcessInfo, error) {
			return nil, nil
		},
	}
	got, err := d.DetectFromConn(tcpConn(7432, 54321))
	if err != nil {
		t.Errorf("unexpected error %v", err)
	}
	if !got.Empty() {
		t.Errorf("non-empty identity for empty chain: %v", got)
	}
}

// TestDebugLoggerReceivesLines confirms the --debug-detection
// integration: detection attempts emit one log line each containing
// the resolved chain. Used by main.go to wire stderr logging.
func TestDebugLoggerReceivesLines(t *testing.T) {
	t.Parallel()
	var captured []string
	d := &detector{
		resolveRemotePID: func(_, _ int) (int, error) { return 100, nil },
		walkProcessTree: func(int) ([]ProcessInfo, error) {
			return []ProcessInfo{
				{Name: "psql", Path: "/usr/bin/psql", PID: 100, PPID: 1},
			}, nil
		},
		debugLogger: func(format string, args ...any) {
			captured = append(captured, fmt.Sprintf(format, args...))
		},
	}
	_, _ = d.DetectFromConn(tcpConn(7432, 54321))
	if len(captured) == 0 {
		t.Fatalf("expected at least one debug line, got 0")
	}
	joined := strings.Join(captured, "\n")
	if !strings.Contains(joined, "human") {
		t.Errorf("debug output missing detected agent name: %q", joined)
	}
}

// TestIsLoopbackAcceptsIPv6 verifies the loopback predicate handles
// ::1 and ::ffff:127.0.0.1 in addition to plain 127.x.x.x.
func TestIsLoopbackAcceptsIPv6(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in     string
		expect bool
	}{
		{"127.0.0.1", true},
		{"127.0.0.2", true},
		{"::1", true},
		{"::ffff:127.0.0.1", true},
		{"10.0.0.1", false},
		{"8.8.8.8", false},
		{"::ffff:8.8.8.8", false},
	}
	for _, tc := range cases {
		got := isLoopback(net.ParseIP(tc.in))
		if got != tc.expect {
			t.Errorf("isLoopback(%q) = %v, want %v", tc.in, got, tc.expect)
		}
	}
}

// TestDetectorIsSafeOnNilReceiver guards against the documented
// nil-default contract from the brief: a nil Detector field on
// pgproxy.Server is supposed to gracefully no-op. We achieve that
// at the call site by checking nil before invoking DetectFromConn,
// but a defensive nil-receiver check inside the type makes the
// invariant uncrossable.
func TestDetectorIsSafeOnNilReceiver(t *testing.T) {
	t.Parallel()
	var d *detector
	got, err := d.DetectFromConn(tcpConn(7432, 54321))
	if err != nil {
		t.Errorf("nil detector returned error %v", err)
	}
	if !got.Empty() {
		t.Errorf("nil detector returned non-empty identity %v", got)
	}
}

// TestDetectFromConnRejectsNonTCP confirms unix-domain or pipe
// connections produce empty rather than panicking on the type
// assertion.
func TestDetectFromConnRejectsNonTCP(t *testing.T) {
	t.Parallel()
	d := New()
	// net.UnixAddr satisfies net.Addr but not *net.TCPAddr.
	conn := stubConn{
		local:  &net.UnixAddr{Net: "unix", Name: "/tmp/x"},
		remote: &net.UnixAddr{Net: "unix", Name: "/tmp/y"},
	}
	got, err := d.DetectFromConn(conn)
	if err != nil {
		t.Errorf("unexpected error %v", err)
	}
	if !got.Empty() {
		t.Errorf("non-empty identity for unix-domain conn: %v", got)
	}
}
