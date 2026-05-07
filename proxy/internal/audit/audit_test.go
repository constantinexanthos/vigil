package audit


import (
	"crypto/ed25519"
	"crypto/rand"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)


func newSigner(t *testing.T) (ed25519.PublicKey, *Ed25519Signer) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("genkey: %v", err)
	}
	return pub, &Ed25519Signer{Key: priv}
}


func TestOpenCreatesSchema(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.db")
	_, signer := newSigner(t)
	w, err := Open(path, signer)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer w.Close()
	// Verify the schema is in place.
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	row := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='audit'`)
	var n int
	if err := row.Scan(&n); err != nil {
		t.Fatalf("query schema: %v", err)
	}
	if n != 1 {
		t.Errorf("expected 1 audit table, got %d", n)
	}
	// Both indexes should exist.
	for _, idx := range []string{"idx_audit_ts", "idx_audit_agent"} {
		row = db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='index' AND name=?`, idx)
		var c int
		if err := row.Scan(&c); err != nil || c != 1 {
			t.Errorf("expected index %s present (got count=%d err=%v)", idx, c, err)
		}
	}
}


func TestWriteAndVerifySignature(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.db")
	pub, signer := newSigner(t)
	w, err := Open(path, signer)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer w.Close()
	now := time.Date(2026, 5, 7, 12, 30, 45, 123_000_000, time.UTC)
	ev := Event{
		Timestamp: now,
		AgentID:   "agent-abc",
		AgentName: "claude-code",
		ConnID:    "conn-123",
		Direction: DirClient,
		MsgType:   "Query",
		QueryText: "SELECT 1",
		Bytes:     14,
	}
	if err := w.Write(ev); err != nil {
		t.Fatalf("write: %v", err)
	}
	// Read the row back and verify the signature.
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	var (
		ts, agentID, connID, msgType, queryText, sig string
	)
	row := db.QueryRow(`SELECT ts, agent_id, conn_id, msg_type, query_text, sig FROM audit WHERE id=1`)
	if err := row.Scan(&ts, &agentID, &connID, &msgType, &queryText, &sig); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if err := Verify(pub, sig, agentID, connID, ts, msgType, queryText); err != nil {
		t.Errorf("Verify failed: %v", err)
	}
}


func TestNullAgentID(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.db")
	pub, signer := newSigner(t)
	w, err := Open(path, signer)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer w.Close()
	ev := Event{
		Timestamp: time.Now().UTC(),
		ConnID:    "conn-456",
		Direction: DirServer,
		MsgType:   "ReadyForQuery",
		Bytes:     6,
	}
	if err := w.Write(ev); err != nil {
		t.Fatalf("write: %v", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	var (
		agentID  sql.NullString
		ts, connID, msgType, sig string
		queryText sql.NullString
	)
	row := db.QueryRow(`SELECT ts, agent_id, conn_id, msg_type, query_text, sig FROM audit WHERE id=1`)
	if err := row.Scan(&ts, &agentID, &connID, &msgType, &queryText, &sig); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if agentID.Valid {
		t.Errorf("expected NULL agent_id, got %q", agentID.String)
	}
	if queryText.Valid {
		t.Errorf("expected NULL query_text, got %q", queryText.String)
	}
	// Verify with empty agent_id/query_text — that's the canonical form.
	if err := Verify(pub, sig, "", connID, ts, msgType, ""); err != nil {
		t.Errorf("verify NULL row: %v", err)
	}
}


func TestRejectsBadDirection(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.db")
	_, signer := newSigner(t)
	w, err := Open(path, signer)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer w.Close()
	err = w.Write(Event{
		Timestamp: time.Now().UTC(),
		ConnID:    "c",
		Direction: Direction("middle"),
		MsgType:   "X",
	})
	if err == nil {
		t.Fatal("expected error for bad direction")
	}
}


func TestMigrationOnExistingDB(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.db")
	// Simulate v0.1.0a database — only an identities table, no audit.
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open seed: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE identities (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatalf("seed identities: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO identities (id) VALUES ('preexisting')`); err != nil {
		t.Fatalf("seed insert: %v", err)
	}
	db.Close()
	// Open with audit; old data must survive.
	_, signer := newSigner(t)
	w, err := Open(path, signer)
	if err != nil {
		t.Fatalf("open audit: %v", err)
	}
	defer w.Close()
	db, err = sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM identities WHERE id='preexisting'`).Scan(&n); err != nil {
		t.Fatalf("count identities: %v", err)
	}
	if n != 1 {
		t.Errorf("preexisting identity row lost; got count=%d", n)
	}
}


func TestCanonicalFormDeterminism(t *testing.T) {
	t.Parallel()
	a := CanonicalForm("a", "c", "t", "Query", "SELECT 1")
	b := CanonicalForm("a", "c", "t", "Query", "SELECT 1")
	if a != b {
		t.Errorf("non-deterministic canonical form: %q vs %q", a, b)
	}
	// Spot-check: changing query_text changes the form.
	c := CanonicalForm("a", "c", "t", "Query", "SELECT 2")
	if a == c {
		t.Errorf("canonical form unchanged for different query_text")
	}
}


func TestFromDBSharing(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	_, signer := newSigner(t)
	w, err := FromDB(db, signer)
	if err != nil {
		t.Fatalf("FromDB: %v", err)
	}
	if err := w.Write(Event{
		Timestamp: time.Now().UTC(),
		ConnID:    "c1",
		Direction: DirClient,
		MsgType:   "Query",
		QueryText: "SELECT 1",
		Bytes:     14,
	}); err != nil {
		t.Fatalf("write: %v", err)
	}
	// FromDB-constructed writer's Close is a no-op on the underlying db.
	if err := w.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Errorf("underlying db should still be usable after writer.Close: %v", err)
	}
}
