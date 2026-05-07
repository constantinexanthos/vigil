package runner

import (
	"context"
	"fmt"
	"math/rand/v2"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// ProxyHandle wraps a started vigil-proxy process. The bench's "through
// proxy" arm connects to ListenAddr; CleanupFn kills the process and
// removes the temp HOME we ran it under.
type ProxyHandle struct {
	ListenAddr string
	CleanupFn  func() error
	LogFile    string
}

// StartProxy builds vigil-proxy, runs it pointed at upstream, and waits
// for its Postgres listener to bind. The bench arm connects to
// localhost:<chosen-port>.
//
// We isolate HOME to a fresh tempdir so the proxy doesn't write its
// SQLite identity store into the developer's actual ~/.vigil — running
// the bench shouldn't leave state behind.
func StartProxy(ctx context.Context, upstream *PostgresHandle, repoRoot string) (*ProxyHandle, error) {
	port := 17432 + rand.IntN(10000)
	listenAddr := fmt.Sprintf("127.0.0.1:%d", port)

	tmpHome, err := os.MkdirTemp("", "vigil-bench-home-*")
	if err != nil {
		return nil, fmt.Errorf("mktemp HOME: %w", err)
	}
	bin := filepath.Join(tmpHome, "vigil-proxy")
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}

	build := exec.CommandContext(ctx, "go", "build", "-o", bin, "./cmd/vigil-proxy")
	build.Dir = filepath.Join(repoRoot, "proxy")
	if out, err := build.CombinedOutput(); err != nil {
		_ = os.RemoveAll(tmpHome)
		return nil, fmt.Errorf("go build vigil-proxy: %w\n%s", err, out)
	}

	logFile := filepath.Join(tmpHome, "proxy.log")
	logF, err := os.Create(logFile)
	if err != nil {
		_ = os.RemoveAll(tmpHome)
		return nil, err
	}

	upstreamAddr := fmt.Sprintf("%s:%d", upstream.Host, upstream.Port)
	httpAddr := fmt.Sprintf("127.0.0.1:%d", 17878+rand.IntN(1000))
	cmd := exec.CommandContext(ctx, bin,
		"--addr", httpAddr,
		"--postgres-listen", listenAddr,
		"--postgres-upstream", upstreamAddr,
	)
	cmd.Env = append(os.Environ(), "HOME="+tmpHome)
	cmd.Stdout = logF
	cmd.Stderr = logF

	if err := cmd.Start(); err != nil {
		_ = logF.Close()
		_ = os.RemoveAll(tmpHome)
		return nil, fmt.Errorf("start vigil-proxy: %w", err)
	}

	cleanup := func() error {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
		_ = logF.Close()
		// Keep the log file on cleanup if it's small — useful for
		// debugging a bench run that died on us. Tempdir gets removed.
		_ = os.RemoveAll(tmpHome)
		return nil
	}

	// Wait for the Postgres listener to bind.
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", listenAddr, 200*time.Millisecond)
		if err == nil {
			_ = c.Close()
			return &ProxyHandle{ListenAddr: listenAddr, CleanupFn: cleanup, LogFile: logFile}, nil
		}
		select {
		case <-ctx.Done():
			_ = cleanup()
			return nil, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
	_ = cleanup()
	return nil, fmt.Errorf("vigil-proxy never bound %s within 15s — see %s", listenAddr, logFile)
}
