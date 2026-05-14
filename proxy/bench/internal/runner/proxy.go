package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// ProxyHandle wraps a started vigil-proxy process. The bench's "through
// proxy" arm connects to ListenAddr; CleanupFn kills the process and
// removes the temp HOME we ran it under.
//
// AgentToken is a valid identity token issued post-startup via the
// proxy's HTTP API. The Postgres arm puts it into application_name as
// `vigil:<token>` so the proxy attaches a non-empty agentID — required
// for the v0.1.0d coalesce path (anonymous connections never coalesce).
type ProxyHandle struct {
	ListenAddr string
	HTTPAddr   string
	AgentToken string
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
			// Postgres is up; now issue an identity via the HTTP API so
			// the bench arm can advertise itself as agent_id=<id>. The
			// HTTP server is on httpAddr — wait for it too (usually
			// it's up by the time Postgres is, but be defensive).
			token, err := waitAndIssueIdentity(ctx, httpAddr, deadline)
			if err != nil {
				_ = cleanup()
				return nil, fmt.Errorf("issue bench identity: %w", err)
			}
			return &ProxyHandle{
				ListenAddr: listenAddr,
				HTTPAddr:   httpAddr,
				AgentToken: token,
				CleanupFn:  cleanup,
				LogFile:    logFile,
			}, nil
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

// waitAndIssueIdentity polls the proxy's HTTP API until it accepts
// connections, then POSTs /identities to mint a fresh agent token.
// Returns the raw token string (the value the proxy will accept as
// `application_name=vigil:<token>`).
func waitAndIssueIdentity(ctx context.Context, httpAddr string, deadline time.Time) (string, error) {
	url := "http://" + httpAddr + "/identities"
	payload := []byte(`{"agent_name":"vigil-bench","principal":"bench@vigil.local","scopes":["read"]}`)

	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
		if err != nil {
			return "", err
		}
		req.Header.Set("content-type", "application/json")
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode/100 == 2 {
			var decoded struct {
				Token struct {
					Token string `json:"token"`
				} `json:"token"`
			}
			err := json.NewDecoder(resp.Body).Decode(&decoded)
			resp.Body.Close()
			if err != nil {
				return "", fmt.Errorf("decode identity response: %w", err)
			}
			if decoded.Token.Token == "" {
				return "", fmt.Errorf("identity response missing token field")
			}
			return decoded.Token.Token, nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
	return "", fmt.Errorf("proxy HTTP at %s never came up", httpAddr)
}
