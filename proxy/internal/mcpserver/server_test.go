package mcpserver

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

// pipeRoundTrip wires a Server's I/O to two bytes.Buffers and runs
// `Run` until input EOF. Lets the test write framed JSON-RPC into the
// in-buffer, then read framed responses from the out-buffer.
type rwBufs struct {
	in  *bytes.Buffer
	out *bytes.Buffer
}

func newRWBufs() *rwBufs {
	return &rwBufs{in: new(bytes.Buffer), out: new(bytes.Buffer)}
}

func writeFramed(t *testing.T, w io.Writer, payload string) {
	t.Helper()
	body := []byte(payload)
	if err := writeMessage(w, body); err != nil {
		t.Fatalf("writeMessage: %v", err)
	}
}

func readAllFramed(t *testing.T, r io.Reader) []json.RawMessage {
	t.Helper()
	br := bufio.NewReader(r)
	var out []json.RawMessage
	for {
		body, err := readMessage(br)
		if err == io.EOF {
			return out
		}
		if err != nil {
			t.Fatalf("readMessage: %v", err)
		}
		out = append(out, body)
	}
}

// Server.Run wires initialize → tools/list → tools/call. The most basic
// gate from the spec: connect, list tools, see the two we ship.
func TestServerInitializeAndListTools(t *testing.T) {
	iss, _ := identity.NewIssuer()
	srv := New(Options{
		Verifier:       iss,
		AuditDBPath:    ":memory:",
		EnvTokenLookup: func() string { return "" },
	})

	bufs := newRWBufs()
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`)

	if err := srv.Run(context.Background(), bufs.in, bufs.out); err != nil && err != io.EOF {
		t.Fatalf("Run: %v", err)
	}

	responses := readAllFramed(t, bufs.out)
	if len(responses) != 2 {
		t.Fatalf("got %d responses, want 2:\n%s", len(responses), bufs.out.String())
	}

	// tools/list response includes both whoami and activity.query.
	listResp := string(responses[1])
	for _, tool := range []string{"vigil.identity.whoami", "vigil.activity.query"} {
		if !strings.Contains(listResp, tool) {
			t.Errorf("tools/list missing %q\n%s", tool, listResp)
		}
	}
}

// whoami with a valid token returns the agent identity.
func TestServerWhoamiWithValidToken(t *testing.T) {
	iss, _ := identity.NewIssuer()
	id, tok, _ := iss.Issue(identity.IssueRequest{
		AgentName: "claude-code",
		Principal: "costa@example.com",
		Scopes:    []string{"read", "write"},
	})

	srv := New(Options{
		Verifier:       iss,
		AuditDBPath:    ":memory:",
		EnvTokenLookup: func() string { return "" },
	})

	bufs := newRWBufs()
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"vigil_token":"`+tok.Token+`"}}}`)
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.identity.whoami","arguments":{}}}`)

	_ = srv.Run(context.Background(), bufs.in, bufs.out)

	responses := readAllFramed(t, bufs.out)
	if len(responses) < 2 {
		t.Fatalf("got %d responses, want 2", len(responses))
	}
	// The whoami response is the second message.
	whoamiResp := string(responses[1])
	for _, want := range []string{
		`"agent_id":"` + id.ID + `"`,
		`"agent_name":"claude-code"`,
		`"principal":"costa@example.com"`,
	} {
		if !strings.Contains(whoamiResp, want) {
			t.Errorf("whoami response missing %q\n%s", want, whoamiResp)
		}
	}
}

// No token → whoami returns agent_id: null (a 200 result, NOT a JSON-RPC
// error). Agents that just installed Vigil and haven't set up auth need
// this to work.
func TestServerWhoamiWithNoTokenReturnsNullAgentID(t *testing.T) {
	iss, _ := identity.NewIssuer()
	srv := New(Options{
		Verifier:       iss,
		AuditDBPath:    ":memory:",
		EnvTokenLookup: func() string { return "" },
	})

	bufs := newRWBufs()
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.identity.whoami","arguments":{}}}`)
	_ = srv.Run(context.Background(), bufs.in, bufs.out)

	responses := readAllFramed(t, bufs.out)
	if len(responses) < 2 {
		t.Fatalf("got %d responses, want 2", len(responses))
	}
	resp := string(responses[1])
	if !strings.Contains(resp, `"agent_id":null`) {
		t.Errorf("expected agent_id: null in response\n%s", resp)
	}
	// And NOT a JSON-RPC error.
	if strings.Contains(resp, `"error"`) {
		t.Errorf("unexpected error in response\n%s", resp)
	}
}

// Invalid token → same as no token (treat as anonymous, don't error).
// The discovery flow needs whoami to "work" before the operator fixes
// auth.
func TestServerWhoamiWithInvalidTokenIsAnonymous(t *testing.T) {
	iss, _ := identity.NewIssuer()
	srv := New(Options{
		Verifier:       iss,
		AuditDBPath:    ":memory:",
		EnvTokenLookup: func() string { return "" },
	})

	bufs := newRWBufs()
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"vigil_token":"not-a-real-token"}}}`)
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vigil.identity.whoami","arguments":{}}}`)
	_ = srv.Run(context.Background(), bufs.in, bufs.out)

	responses := readAllFramed(t, bufs.out)
	if len(responses) < 2 {
		t.Fatalf("got %d responses, want 2", len(responses))
	}
	resp := string(responses[1])
	if !strings.Contains(resp, `"agent_id":null`) {
		t.Errorf("expected agent_id: null for invalid token, got:\n%s", resp)
	}
	if strings.Contains(resp, `"error"`) {
		t.Errorf("unexpected error response for invalid token:\n%s", resp)
	}
}

// activity.query is scoped to the caller's agent_id. Agent A makes a
// query, sees only their own audit rows; never sees agent B's. Anonymous
// callers see empty rows.
func TestServerActivityQueryScopedPerAgent(t *testing.T) {
	iss, _ := identity.NewIssuer()
	idA, tokA, _ := iss.Issue(identity.IssueRequest{AgentName: "agent-A", Principal: "a@example.com"})
	idB, tokB, _ := iss.Issue(identity.IssueRequest{AgentName: "agent-B", Principal: "b@example.com"})

	// Seed an audit DB with rows for both agents.
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "audit.db")
	seedAuditRows(t, dbPath, []auditRow{
		{agentID: idA.ID, agentName: "agent-A", msgType: "Query", queryText: "SELECT 1", bytes: 14, decision: "allowed"},
		{agentID: idA.ID, agentName: "agent-A", msgType: "Query", queryText: "SELECT 2", bytes: 14, decision: "allowed"},
		{agentID: idB.ID, agentName: "agent-B", msgType: "Query", queryText: "SELECT 3", bytes: 14, decision: "allowed"},
	})

	// Agent A's query: 2 rows.
	respA := callTool(t, iss, dbPath, tokA.Token, "vigil.activity.query", `{"limit":100}`)
	if !strings.Contains(respA, `"total":2`) {
		t.Errorf("agent A summary.total = wrong\n%s", respA)
	}
	if strings.Contains(respA, "SELECT 3") {
		t.Errorf("agent A saw agent B's audit row\n%s", respA)
	}

	// Agent B's query: 1 row.
	respB := callTool(t, iss, dbPath, tokB.Token, "vigil.activity.query", `{"limit":100}`)
	if !strings.Contains(respB, `"total":1`) {
		t.Errorf("agent B summary.total = wrong\n%s", respB)
	}
	if !strings.Contains(respB, "SELECT 3") {
		t.Errorf("agent B didn't see own row\n%s", respB)
	}

	// Anonymous: empty rows.
	respAnon := callTool(t, iss, dbPath, "", "vigil.activity.query", `{"limit":100}`)
	if !strings.Contains(respAnon, `"total":0`) {
		t.Errorf("anonymous should see total=0\n%s", respAnon)
	}
}

// activity.query honors since (only newer rows) and msg_type (only
// matching rows). The two filters compose AND-wise.
func TestServerActivityQueryFilters(t *testing.T) {
	iss, _ := identity.NewIssuer()
	id, tok, _ := iss.Issue(identity.IssueRequest{AgentName: "x", Principal: "p"})

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "audit.db")

	old := time.Now().UTC().Add(-2 * time.Hour).Format("2006-01-02T15:04:05.000Z")
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	seedAuditRowsExplicit(t, dbPath, []auditRow{
		{agentID: id.ID, agentName: "x", msgType: "Query", queryText: "old query", bytes: 10, decision: "allowed", ts: old},
		{agentID: id.ID, agentName: "x", msgType: "Query", queryText: "new query", bytes: 10, decision: "allowed", ts: now},
		{agentID: id.ID, agentName: "x", msgType: "Parse", queryText: "parsed", bytes: 10, decision: "allowed", ts: now},
	})

	// since cuts off the old row.
	cutoff := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339)
	resp := callTool(t, iss, dbPath, tok.Token, "vigil.activity.query",
		`{"since":"`+cutoff+`","limit":100}`)
	if !strings.Contains(resp, `"total":2`) {
		t.Errorf("since filter: total = wrong\n%s", resp)
	}
	if strings.Contains(resp, "old query") {
		t.Errorf("since filter let through stale row\n%s", resp)
	}

	// msg_type narrows further.
	resp = callTool(t, iss, dbPath, tok.Token, "vigil.activity.query",
		`{"msg_type":"Parse","limit":100}`)
	if !strings.Contains(resp, `"total":1`) {
		t.Errorf("msg_type filter: total = wrong\n%s", resp)
	}
	if !strings.Contains(resp, "parsed") {
		t.Errorf("msg_type filter dropped matching row\n%s", resp)
	}
}

// callTool is a test helper: spin a server, send init + tools/call,
// return the tool-call response body.
func callTool(t *testing.T, iss *identity.Issuer, dbPath, token, toolName, args string) string {
	t.Helper()
	srv := New(Options{
		Verifier:       iss,
		AuditDBPath:    dbPath,
		EnvTokenLookup: func() string { return "" },
	})
	bufs := newRWBufs()
	initParams := `{}`
	if token != "" {
		initParams = `{"clientInfo":{"vigil_token":"` + token + `"}}`
	}
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":`+initParams+`}`)
	writeFramed(t, bufs.in, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"`+toolName+`","arguments":`+args+`}}`)
	_ = srv.Run(context.Background(), bufs.in, bufs.out)

	responses := readAllFramed(t, bufs.out)
	if len(responses) < 2 {
		t.Fatalf("got %d responses, want >= 2", len(responses))
	}
	return string(responses[1])
}

type auditRow struct {
	agentID, agentName, msgType, queryText, decision, ts string
	bytes                                                int
}

func seedAuditRows(t *testing.T, dbPath string, rows []auditRow) {
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
  bytes INTEGER NOT NULL,
  sig TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'allowed'
)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for _, r := range rows {
		_, err := db.Exec(
			`INSERT INTO audit (agent_id, agent_name, conn_id, direction, msg_type, query_text, bytes, sig, decision) VALUES (?, ?, ?, 'client', ?, ?, ?, '', ?)`,
			r.agentID, r.agentName, "test-conn", r.msgType, r.queryText, r.bytes, r.decision,
		)
		if err != nil {
			t.Fatalf("seed insert: %v", err)
		}
	}
}

func seedAuditRowsExplicit(t *testing.T, dbPath string, rows []auditRow) {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  conn_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('client','server')),
  msg_type TEXT NOT NULL,
  query_text TEXT,
  bytes INTEGER NOT NULL,
  sig TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'allowed'
)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for _, r := range rows {
		_, err := db.Exec(
			`INSERT INTO audit (ts, agent_id, agent_name, conn_id, direction, msg_type, query_text, bytes, sig, decision) VALUES (?, ?, ?, ?, 'client', ?, ?, ?, '', ?)`,
			r.ts, r.agentID, r.agentName, "test-conn", r.msgType, r.queryText, r.bytes, r.decision,
		)
		if err != nil {
			t.Fatalf("seed insert: %v", err)
		}
	}
}
