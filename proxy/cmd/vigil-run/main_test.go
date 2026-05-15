package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// TestParseFlags_StopsAtFirstNonFlag is the most load-bearing test in
// this package. If we drift on this, `vigil-run claude --some-flag`
// silently swallows --some-flag and breaks every user. See main.go's
// parseFlags rationale.
func TestParseFlags_StopsAtFirstNonFlag(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		argv    []string
		want    flags
		wantErr bool
	}{
		{
			name: "command and its flag passes through",
			argv: []string{"claude", "--some-flag", "value"},
			want: flags{Args: []string{"claude", "--some-flag", "value"}},
		},
		{
			name: "principal and command",
			argv: []string{"--principal=alice@example.com", "claude"},
			want: flags{Principal: "alice@example.com", Args: []string{"claude"}},
		},
		{
			name: "space-separated value",
			argv: []string{"--principal", "alice@example.com", "claude"},
			want: flags{Principal: "alice@example.com", Args: []string{"claude"}},
		},
		{
			name: "scopes split",
			argv: []string{"--scopes=read,write,admin", "claude"},
			want: flags{Scopes: []string{"read", "write", "admin"}, Args: []string{"claude"}},
		},
		{
			name: "rotate flag",
			argv: []string{"--rotate", "claude"},
			want: flags{Rotate: true, Args: []string{"claude"}},
		},
		{
			name: "explicit -- terminator",
			argv: []string{"--principal=alice@example.com", "--", "claude", "--rotate"},
			want: flags{Principal: "alice@example.com", Args: []string{"claude", "--rotate"}},
		},
		{
			name: "name override",
			argv: []string{"--name=my-bot", "python", "script.py"},
			want: flags{AgentName: "my-bot", Args: []string{"python", "script.py"}},
		},
		{
			name:    "unknown flag errors",
			argv:    []string{"--bogus", "claude"},
			wantErr: true,
		},
		{
			name:    "missing value errors",
			argv:    []string{"--principal"},
			wantErr: true,
		},
		{
			name: "help short-circuits",
			argv: []string{"--help"},
			want: flags{Help: true},
		},
		{
			name: "no command yields no args",
			argv: []string{},
			want: flags{},
		},
		{
			name: "version flag",
			argv: []string{"--version"},
			want: flags{Version: true},
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseFlags(tc.argv)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("want error, got nil; result=%+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !flagsEqual(got, tc.want) {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

// flagsEqual is a hand-rolled comparison because Scopes is a slice and
// reflect.DeepEqual would treat nil and empty differently.
func flagsEqual(a, b flags) bool {
	if a.Principal != b.Principal || a.ProxyURL != b.ProxyURL ||
		a.AgentName != b.AgentName || a.Rotate != b.Rotate ||
		a.Help != b.Help || a.Version != b.Version {
		return false
	}
	if !stringSlicesEqual(a.Scopes, b.Scopes) {
		return false
	}
	return stringSlicesEqual(a.Args, b.Args)
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// TestResolveAgentName covers the canonical-name mapping.
func TestResolveAgentName(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"claude":          "claude-code",
		"/usr/bin/claude": "claude-code",
		"codex":           "codex",
		"cursor":          "cursor",
		"cursor-agent":    "cursor",
		"code":            "vscode",
		"code-insiders":   "vscode",
		"python":          "python",
		"node":            "node",
		"/opt/bin/mybot":  "mybot",
		"mybot.exe":       "mybot",
	}
	for in, want := range cases {
		if got := resolveAgentName(in); got != want {
			t.Errorf("resolveAgentName(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestScrubAndInjectEnv verifies that we strip any pre-existing
// VIGIL_TOKEN from the parent env (so a stale shell variable can't
// pollute the subprocess), then append our fresh one. Other VIGIL_*
// vars MUST be left alone.
func TestScrubAndInjectEnv(t *testing.T) {
	t.Parallel()
	parent := []string{
		"PATH=/usr/bin",
		"VIGIL_TOKEN=stale-old-token",
		"VIGIL_PROXY_URL=http://localhost:7878",
		"VIGIL_DEBUG=1",
	}
	out := scrubAndInjectEnv(parent, "fresh-token-xyz")
	found := map[string]string{}
	for _, kv := range out {
		k, v, _ := strings.Cut(kv, "=")
		found[k] = v
	}
	if found["VIGIL_TOKEN"] != "fresh-token-xyz" {
		t.Errorf("VIGIL_TOKEN = %q, want fresh-token-xyz", found["VIGIL_TOKEN"])
	}
	if found["VIGIL_PROXY_URL"] != "http://localhost:7878" {
		t.Errorf("VIGIL_PROXY_URL was scrubbed, want preserved")
	}
	if found["VIGIL_DEBUG"] != "1" {
		t.Errorf("VIGIL_DEBUG was scrubbed, want preserved")
	}
	if found["PATH"] != "/usr/bin" {
		t.Errorf("PATH was scrubbed, want preserved")
	}
	// Verify there's only one VIGIL_TOKEN entry — duplicate KEY=
	// entries in env are technically allowed but defy POLA.
	count := 0
	for _, kv := range out {
		if strings.HasPrefix(kv, "VIGIL_TOKEN=") {
			count++
		}
	}
	if count != 1 {
		t.Errorf("got %d VIGIL_TOKEN entries, want exactly 1", count)
	}
}

// TestMintIdentity_Success exercises the happy path against an
// in-process HTTP server stubbed to return a canonical /identities
// response.
func TestMintIdentity_Success(t *testing.T) {
	t.Parallel()
	exp := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/identities" {
			http.Error(w, "wrong path", http.StatusBadRequest)
			return
		}
		var got identityReq
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if got.AgentName != "claude-code" || got.Principal != "alice@example.com" {
			http.Error(w, "wrong body", http.StatusBadRequest)
			return
		}
		resp := identityResp{}
		resp.Identity.ID = "id-1"
		resp.Identity.ExpiresAt = exp
		resp.Token.Token = "fake.signedtoken"
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	tok, gotExp, err := mintIdentity(context.Background(), srv.Client(), srv.URL, identityReq{
		AgentName: "claude-code",
		Principal: "alice@example.com",
		Scopes:    []string{"read", "write"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok != "fake.signedtoken" {
		t.Errorf("token = %q, want %q", tok, "fake.signedtoken")
	}
	if !gotExp.Equal(exp) {
		t.Errorf("expiresAt = %v, want %v", gotExp, exp)
	}
}

// TestMintIdentity_ProxyUnreachable verifies the actionable error.
// We point at a closed port and expect a proxyUnreachableErr so that
// main.go can map it to exit code 2.
func TestMintIdentity_ProxyUnreachable(t *testing.T) {
	t.Parallel()
	// Reserve a port then close — anything that dials it gets refused.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	dead := srv.URL
	srv.Close()

	_, _, err := mintIdentity(context.Background(), &http.Client{Timeout: 2 * time.Second}, dead, identityReq{
		AgentName: "claude-code",
		Principal: "alice@example.com",
	})
	if err == nil {
		t.Fatal("want error, got nil")
	}
	if !isProxyUnreachable(err) {
		t.Errorf("err = %v, want proxyUnreachableErr", err)
	}
	if !strings.Contains(err.Error(), "vigil-proxy is not running") {
		t.Errorf("err message missing actionable hint: %s", err.Error())
	}
}

// TestResolveIdentity_CacheHitAndRefresh covers the cache logic. First
// call mints a token; second call returns the cached one; third call
// with --rotate forces a fresh mint.
func TestResolveIdentity_CacheHitAndRefresh(t *testing.T) {
	t.Parallel()
	var mintCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mintCalls++
		resp := identityResp{}
		resp.Identity.ExpiresAt = time.Now().Add(24 * time.Hour)
		resp.Token.Token = "token-mint-" + tostr(mintCalls)
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	store := newFakeStore()
	f := flags{
		Principal: "alice@example.com",
		AgentName: "claude-code",
		ProxyURL:  srv.URL,
	}

	tok1, err := resolveIdentity(context.Background(), f, store, srv.Client())
	if err != nil || tok1 != "token-mint-1" {
		t.Fatalf("first mint: tok=%q err=%v", tok1, err)
	}

	// Second call hits the cache.
	tok2, err := resolveIdentity(context.Background(), f, store, srv.Client())
	if err != nil || tok2 != "token-mint-1" {
		t.Fatalf("cache hit: tok=%q err=%v", tok2, err)
	}
	if mintCalls != 1 {
		t.Fatalf("expected exactly 1 mint after cache hit, got %d", mintCalls)
	}

	// --rotate forces a fresh mint.
	f.Rotate = true
	tok3, err := resolveIdentity(context.Background(), f, store, srv.Client())
	if err != nil || tok3 != "token-mint-2" {
		t.Fatalf("rotate: tok=%q err=%v", tok3, err)
	}
	if mintCalls != 2 {
		t.Fatalf("expected 2 mints after --rotate, got %d", mintCalls)
	}
}

// TestResolveIdentity_RefreshNearExpiration verifies that a cached
// token whose expiration is closer than rotateGracePeriod is treated
// as a miss. Without this, a daily-cron `vigil-run` workflow that ran
// 23h59m after the previous one would inject a token that expires
// inside the wrapped session.
func TestResolveIdentity_RefreshNearExpiration(t *testing.T) {
	t.Parallel()
	var mintCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mintCalls++
		resp := identityResp{}
		resp.Identity.ExpiresAt = time.Now().Add(24 * time.Hour)
		resp.Token.Token = "fresh-token"
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	store := newFakeStore()
	// Pre-populate with a soon-to-expire token.
	_ = store.set("alice@example.com", "claude-code", cachedToken{
		Token:     "stale-token",
		ExpiresAt: time.Now().Add(30 * time.Minute), // < 1h grace
	})

	tok, err := resolveIdentity(context.Background(), flags{
		Principal: "alice@example.com",
		AgentName: "claude-code",
		ProxyURL:  srv.URL,
	}, store, srv.Client())
	if err != nil || tok != "fresh-token" {
		t.Fatalf("expected refresh; tok=%q err=%v mintCalls=%d", tok, err, mintCalls)
	}
}

// TestRun_VigilTokenReachesSubprocess is the acceptance criterion #1
// test: vigil-run sets VIGIL_TOKEN in the subprocess environment, and
// the subprocess can see it. We can't use syscall.Exec inside go test
// (it would terminate the test process), so we run vigil-run as a
// child binary via go run and capture its stdout.
//
// Skipped on Windows because syscall.Exec isn't available there.
func TestRun_VigilTokenReachesSubprocess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("syscall.Exec contract is Unix-only; Windows path tested separately")
	}
	// Cannot t.Parallel — t.Setenv below mutates process env.

	// In-process proxy stub.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := identityResp{}
		resp.Identity.ExpiresAt = time.Now().Add(24 * time.Hour)
		resp.Token.Token = "subprocess-visible-token"
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	// Build vigil-run into a temp dir. We pass the host HOME through
	// to `go build` so the module cache reuses the developer's
	// existing $GOPATH (otherwise Go re-downloads everything into
	// the test's temp dir and t.TempDir's RemoveAll trips over
	// read-only module cache files).
	binPath := filepath.Join(t.TempDir(), "vigil-run")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		t.Fatalf("build vigil-run: %v", err)
	}

	// The wrapped subprocess runs against an isolated temp dir for
	// its own state (so it doesn't write to the developer's
	// ~/.config/vigil); HOME is overridden ONLY for the child, not
	// for the go-build above.
	tmpHome := t.TempDir()

	// `sh -c 'echo $VIGIL_TOKEN'` is the canonical probe.
	cmd := exec.Command(binPath,
		"--principal=test@example.com",
		"--proxy="+srv.URL,
		"sh", "-c", "echo $VIGIL_TOKEN",
	)
	// VIGIL_RUN_SKIP_KEYCHAIN=1 forces the file fallback so we don't
	// trigger a Keychain UI prompt on macOS dev machines and don't
	// hang on dbus calls in headless CI. Inherit PATH so sh resolves.
	cmd.Env = []string{
		"HOME=" + tmpHome,
		"PATH=" + os.Getenv("PATH"),
		"VIGIL_PROXY_URL=" + srv.URL,
		"VIGIL_RUN_CACHE_DIR=" + filepath.Join(tmpHome, ".cache"),
		"VIGIL_RUN_SKIP_KEYCHAIN=1",
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("vigil-run subprocess: %v\noutput: %s", err, out)
	}
	got := strings.TrimSpace(string(out))
	if got != "subprocess-visible-token" {
		t.Fatalf("VIGIL_TOKEN in subprocess = %q, want %q\nfull output: %s",
			got, "subprocess-visible-token", out)
	}
}

// TestRun_ProxyUnreachableExits2 verifies the exit-code contract.
func TestRun_ProxyUnreachableExits2(t *testing.T) {
	// Cannot t.Parallel — t.Setenv below mutates process env.
	var stderr bytes.Buffer
	// Closed server → connection refused.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	dead := srv.URL
	srv.Close()

	// Use a non-existent home so the keychain test stub is also
	// confined. VIGIL_RUN_SKIP_KEYCHAIN=1 keeps the cache lookup
	// off the OS keychain in case a developer's machine has one
	// configured (would otherwise trigger a UI prompt on macOS).
	t.Setenv("HOME", t.TempDir())
	t.Setenv("VIGIL_PROXY_URL", "")
	t.Setenv("VIGIL_RUN_SKIP_KEYCHAIN", "1")
	t.Setenv("VIGIL_RUN_CACHE_DIR", t.TempDir())

	code := run([]string{
		"--proxy=" + dead,
		"--principal=alice@example.com",
		"sh", "-c", "echo should-not-run",
	}, &stderr)
	if code != 2 {
		t.Fatalf("exit code = %d, want 2; stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), "vigil-proxy is not running") {
		t.Errorf("missing actionable hint in stderr: %s", stderr.String())
	}
}

// TestRun_MissingCommandExits3 covers the "user just typed `vigil-run`"
// case.
func TestRun_MissingCommandExits3(t *testing.T) {
	t.Parallel()
	var stderr bytes.Buffer
	code := run([]string{"--principal=alice@example.com"}, &stderr)
	if code != 3 {
		t.Fatalf("exit code = %d, want 3; stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), "missing wrapped command") {
		t.Errorf("missing actionable hint in stderr: %s", stderr.String())
	}
}

// TestRun_UnknownCommandExits127 covers a typo'd binary name.
func TestRun_UnknownCommandExits127(t *testing.T) {
	// Cannot t.Parallel — t.Setenv below mutates process env.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := identityResp{}
		resp.Identity.ExpiresAt = time.Now().Add(24 * time.Hour)
		resp.Token.Token = "doesnt-matter"
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("VIGIL_RUN_SKIP_KEYCHAIN", "1")
	t.Setenv("VIGIL_RUN_CACHE_DIR", t.TempDir())

	var stderr bytes.Buffer
	code := run([]string{
		"--proxy=" + srv.URL,
		"--principal=alice@example.com",
		"this-binary-does-not-exist-on-PATH-7c2a",
	}, &stderr)
	if code != 127 {
		t.Fatalf("exit code = %d, want 127; stderr: %s", code, stderr.String())
	}
}

// TestRun_HelpExits0 covers `--help` printing usage to stderr.
func TestRun_HelpExits0(t *testing.T) {
	t.Parallel()
	var stderr bytes.Buffer
	code := run([]string{"--help"}, &stderr)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if !strings.Contains(stderr.String(), "vigil-run — wrap any subprocess") {
		t.Errorf("missing usage in stderr: %s", stderr.String())
	}
}

// tostr converts an int to a string without pulling in strconv at the
// test layer. Avoids a stdlib import that grew with no real call site.
func tostr(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
