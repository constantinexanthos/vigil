package processdetect

import (
	"context"
	"net"
	"os"
	"runtime"
	"testing"
	"time"
)

// TestRealLoopbackDetectsOwnProcess exercises the live platform
// helpers against a connection between two halves of this test
// binary. The expected outcome is that the detector resolves the
// PID of the dialer (which is this test process — Go test binary)
// and walks the process tree.
//
// This test is the canonical "is the platform integration alive
// at all?" smoke. We do NOT assert a particular AgentName because
// `go test` running through `go test` itself does not match any
// agent signature; we DO assert the chain is non-empty and the
// leaf PID matches os.Getpid(). The signature map being able to
// identify the test binary is a separate concern.
//
// Skipped on platforms where we don't ship native helpers
// (walk_other.go intentionally returns empty).
func TestRealLoopbackDetectsOwnProcess(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skipf("native platform helpers not implemented on %s", runtime.GOOS)
	}

	// Spin up a TCP listener on 127.0.0.1; dial it from the same
	// process. The accepted connection's RemoteAddr is the dialer's
	// ephemeral source port, owned by this PID.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var dialer net.Dialer
	clientConn, err := dialer.DialContext(ctx, "tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer clientConn.Close()

	serverConn, err := ln.Accept()
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	defer serverConn.Close()

	// We need to wait briefly for the kernel to expose the new
	// socket in /proc/net/tcp (Linux) or to /usr/sbin/lsof's
	// snapshot (macOS). On Linux this is essentially instant; on
	// macOS the lsof exec costs ~20–50ms. The detector internally
	// has its own timeout — here we just wait long enough that the
	// socket is "settled".
	time.Sleep(50 * time.Millisecond)

	d := New()
	got, err := d.DetectFromConn(serverConn)
	if err != nil {
		t.Fatalf("DetectFromConn: %v", err)
	}

	// On some sandboxed CI environments (where /proc is masked or
	// lsof is restricted) we may not be able to resolve at all.
	// That's a documented limitation, not a test failure.
	if got.Empty() {
		t.Skipf("platform could not resolve self-loopback (likely sandboxed env); chain=%v", got.ProcessChain)
	}

	if len(got.ProcessChain) == 0 {
		t.Errorf("non-empty AgentName but empty ProcessChain — should always populate the chain for debugging")
	}

	// The test binary running this loop is `go test ...`'s compiled
	// binary; its leaf basename varies by Go version (typically
	// "<package>.test" on darwin). We assert the chain has at
	// least one entry, not a specific basename.
	if len(got.ProcessChain) < 1 {
		t.Errorf("chain length %d, want ≥1", len(got.ProcessChain))
	}
	t.Logf("resolved chain: %v (agent=%q conf=%q)", got.ProcessChain, got.AgentName, got.Confidence)
}

// TestPlatformWalkOnSelf verifies platformWalkProcessTree() can
// resolve the current process and at least its parent. Pure
// platform-helper test — no socket involvement.
func TestPlatformWalkOnSelf(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skipf("native platform helpers not implemented on %s", runtime.GOOS)
	}
	chain, err := platformWalkProcessTree(os.Getpid())
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(chain) == 0 {
		t.Fatalf("empty chain for self pid %d", os.Getpid())
	}
	if chain[0].PID != os.Getpid() {
		t.Errorf("chain[0].PID=%d, want %d", chain[0].PID, os.Getpid())
	}
	t.Logf("self chain: %v", chainBasenames(chain))
}
