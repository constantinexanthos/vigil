package main_test

import (
	"bufio"
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"net/textproto"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/costaxanthos/vigil/proxy/internal/identity"

	_ "modernc.org/sqlite"
)

// TestMCPStdioAcceptance is the end-to-end gate for the --mcp-stdio
// path. It builds vigil-proxy, spawns it as a subprocess with the
// flag set, and drives the JSON-RPC protocol over stdin/stdout. The
// in-process mcpserver tests cover dispatch and tool semantics; this
// test catches main.go wiring bugs the unit tests cannot see (flag
// parsing, log-to-stderr redirection, audit-schema bootstrap, env
// token pickup, and the EOF-clean-shutdown contract).
//
// The test does NOT use `go test`-style table cases inside one
// subprocess because each scenario wants a fresh server state
// (initialize is one-shot). Spawning a subprocess per scenario is
// ~50ms each — well under the test budget.
func TestMCPStdioAcceptance(t *testing.T) {
	bin := buildVigilProxy(t)
	tmpDir := t.TempDir()
	keyPath := filepath.Join(tmpDir, "proxy.key")
	dbPath := filepath.Join(tmpDir, "proxy.db")

	iss, err := identity.LoadOrCreateIssuer(keyPath)
	if err != nil {
		t.Fatalf("load issuer: %v", err)
	}
	idn, tok, err := iss.Issue(identity.IssueRequest{
		AgentName: "claude-code",
		Principal: "test@example.com",
		Scopes:    []string{"read"},
	})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	seedAuditRows(t, dbPath, []seedRow{
		{agentID: idn.ID, agentName: "claude-code", msgType: "Query", queryText: "SELECT 1"},
		{agentID: "other-agent", agentName: "cursor", msgType: "Query", queryText: "SELECT 2"},
	})

	t.Run("anonymous whoami returns null identity", func(t *testing.T) {
		responses := runMCPSubprocess(t, bin, dbPath, keyPath, "", []string{
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{}}}`,
			`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
			`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.identity.whoami","arguments":{}}}`,
		})
		if len(responses) != 2 {
			t.Fatalf("got %d responses, want 2 (init + whoami; notification is silent): %v", len(responses), responses)
		}
		if !strings.Contains(responses[1], `"agent_id":null`) {
			t.Errorf("anonymous whoami: agent_id != null\n%s", responses[1])
		}
	})

	t.Run("VIGIL_TOKEN env yields authed whoami", func(t *testing.T) {
		responses := runMCPSubprocess(t, bin, dbPath, keyPath, tok.Token, []string{
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{}}}`,
			`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
			`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.identity.whoami","arguments":{}}}`,
		})
		if len(responses) != 2 {
			t.Fatalf("got %d responses, want 2: %v", len(responses), responses)
		}
		if !strings.Contains(responses[1], `"agent_name":"claude-code"`) {
			t.Errorf("authed whoami: agent_name missing\n%s", responses[1])
		}
	})

	t.Run("clientInfo.vigil_token overrides VIGIL_TOKEN env", func(t *testing.T) {
		// Initialize params carry the real token; env is a bogus value
		// that would fail verification. clientInfo wins per the May 7
		// spec, so authed whoami succeeds.
		initParams := `{"protocolVersion":"2024-11-05","clientInfo":{"vigil_token":"` + tok.Token + `"}}`
		responses := runMCPSubprocess(t, bin, dbPath, keyPath, "bogus-env-token", []string{
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":` + initParams + `}`,
			`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
			`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.identity.whoami","arguments":{}}}`,
		})
		if len(responses) != 2 {
			t.Fatalf("got %d responses, want 2: %v", len(responses), responses)
		}
		if !strings.Contains(responses[1], `"agent_name":"claude-code"`) {
			t.Errorf("clientInfo whoami: agent_name missing\n%s", responses[1])
		}
	})

	t.Run("activity.query scopes to the authed agent", func(t *testing.T) {
		responses := runMCPSubprocess(t, bin, dbPath, keyPath, tok.Token, []string{
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{}}}`,
			`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
			`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.activity.query","arguments":{"limit":10}}}`,
		})
		if len(responses) != 2 {
			t.Fatalf("got %d responses, want 2: %v", len(responses), responses)
		}
		body := responses[1]
		if !strings.Contains(body, "SELECT 1") {
			t.Errorf("authed agent missing its own row\n%s", body)
		}
		if strings.Contains(body, "SELECT 2") {
			t.Errorf("authed agent leaked cursor's row\n%s", body)
		}
	})

	t.Run("anonymous activity.query returns empty rows", func(t *testing.T) {
		responses := runMCPSubprocess(t, bin, dbPath, keyPath, "", []string{
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{}}}`,
			`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
			`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.activity.query","arguments":{}}}`,
		})
		if len(responses) != 2 {
			t.Fatalf("got %d responses, want 2: %v", len(responses), responses)
		}
		body := responses[1]
		if strings.Contains(body, "SELECT 1") || strings.Contains(body, "SELECT 2") {
			t.Errorf("anonymous activity.query returned a row\n%s", body)
		}
	})

	t.Run("tools/list returns both vigil tools", func(t *testing.T) {
		responses := runMCPSubprocess(t, bin, dbPath, keyPath, "", []string{
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{}}}`,
			`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
			`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		})
		if len(responses) != 2 {
			t.Fatalf("got %d responses, want 2: %v", len(responses), responses)
		}
		body := responses[1]
		if !strings.Contains(body, "vigil.identity.whoami") || !strings.Contains(body, "vigil.activity.query") {
			t.Errorf("tools/list missing expected tools\n%s", body)
		}
	})
}

// buildVigilProxy compiles the binary under test into a tempfile and
// returns the path. Compiled once per test invocation via t.TempDir's
// per-test cache; reuse across subtests is automatic.
func buildVigilProxy(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "vigil-proxy")
	cmd := exec.Command("go", "build", "-o", bin, ".")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go build: %v\n%s", err, out)
	}
	return bin
}

// runMCPSubprocess spawns vigil-proxy in --mcp-stdio mode, writes each
// JSON-RPC message as a Content-Length frame to stdin, closes stdin to
// signal EOF, then reads all framed responses from stdout. Returns the
// response bodies (one per request that had an id; notifications get
// no response).
//
// The subprocess must exit cleanly on stdin EOF — that's the contract
// of Server.Run, and any other behavior (hang, panic) fails the test
// via the t.Fatalf path inside.
func runMCPSubprocess(t *testing.T, bin, dbPath, keyPath, token string, messages []string) []string {
	t.Helper()
	cmd := exec.Command(bin, "--mcp-stdio", "--db", dbPath, "--key", keyPath)
	env := append(os.Environ(), "VIGIL_PROXY_ADDR=", "VIGIL_POSTGRES_LISTEN=")
	if token != "" {
		env = append(env, "VIGIL_TOKEN="+token)
	}
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatalf("stdin pipe: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("stdout pipe: %v", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}

	for _, msg := range messages {
		if err := writeFrame(stdin, []byte(msg)); err != nil {
			t.Fatalf("write frame: %v", err)
		}
	}
	stdin.Close()

	br := bufio.NewReader(stdout)
	var responses []string
	for {
		body, err := readFrame(br)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read frame: %v\nstderr: %s", err, stderr.String())
		}
		responses = append(responses, string(body))
	}

	if err := cmd.Wait(); err != nil {
		t.Fatalf("subprocess exited non-zero: %v\nstderr: %s", err, stderr.String())
	}
	return responses
}

// writeFrame emits a single Content-Length-framed body to w. Matches
// the wire format mcpserver/transport_stdio.go produces; we re-
// implement here rather than importing the unexported helpers because
// (a) it's <10 lines and (b) the acceptance test should treat the
// binary as a black box, not link against its internals.
func writeFrame(w io.Writer, body []byte) error {
	if _, err := fmt.Fprintf(w, "Content-Length: %d\r\n\r\n", len(body)); err != nil {
		return err
	}
	_, err := w.Write(body)
	return err
}

// readFrame parses one Content-Length-framed body off br. Returns
// io.EOF on a clean end-of-stream.
func readFrame(br *bufio.Reader) ([]byte, error) {
	tp := textproto.NewReader(br)
	headers, err := tp.ReadMIMEHeader()
	if err != nil {
		return nil, err
	}
	cl := headers.Get("Content-Length")
	if cl == "" {
		return nil, fmt.Errorf("readFrame: missing Content-Length")
	}
	n, err := strconv.Atoi(cl)
	if err != nil {
		return nil, fmt.Errorf("readFrame: bad Content-Length %q: %w", cl, err)
	}
	body := make([]byte, n)
	if _, err := io.ReadFull(br, body); err != nil {
		return nil, err
	}
	return body, nil
}

type seedRow struct {
	agentID, agentName, msgType, queryText, decision string
}

// seedAuditRows opens dbPath via the SQLite driver, ensures the audit
// table exists, and inserts the given rows. The schema mirrors the one
// audit.Open creates so the activity.query tool reads them back without
// migration glue. Inserts use empty signatures — the activity tool
// doesn't return sigs to the agent, so this saves us standing up a
// signer just for seeding.
func seedAuditRows(t *testing.T, dbPath string, rows []seedRow) {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  agent_id TEXT,
  agent_name TEXT,
  conn_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('client','server')),
  msg_type TEXT NOT NULL,
  query_text TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  sig TEXT,
  decision TEXT NOT NULL DEFAULT 'allowed'
)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for _, r := range rows {
		decision := r.decision
		if decision == "" {
			decision = "allowed"
		}
		if _, err := db.Exec(
			`INSERT INTO audit (agent_id, agent_name, conn_id, direction, msg_type, query_text, bytes, sig, decision) VALUES (?, ?, 'test-conn', 'client', ?, ?, 0, '', ?)`,
			r.agentID, r.agentName, r.msgType, r.queryText, decision,
		); err != nil {
			t.Fatalf("seed insert: %v", err)
		}
	}
}
