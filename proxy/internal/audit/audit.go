// Package audit ships v0.1.0b's signed audit trail for the Postgres proxy.
//
// Every parsed Postgres message that flows through pgproxy gets one row in
// the `audit` table. Rows are signed with the issuer's Ed25519 key over a
// canonical form so any column tamper is detectable later.
//
// Schema is additive on top of the v0.1.0a identity database — opening
// against a v0.1.0a proxy.db creates the audit table and indexes, then
// returns; no data migration on existing identity rows.
package audit


import (
	"crypto/ed25519"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite" // pure-Go driver, no CGO required
)


// Schema is the canonical audit-table schema. Other agents (Tauri app,
// MCP server, benchmark harness) read this table and rely on these
// column names. Changes here are a contract change.
//
// The decision column was added in the 2026-05-15 prep PR for
// v0.1.0c (rate-limit) and v0.1.0d (coalesce). v0.1.0b databases
// without the column are migrated idempotently in Open / FromDB.
//
// The agent_source column was added in v0.1.0e to distinguish
// declared (Tier-2 signed) identity from inferred (Tier-1 process-
// tree introspected) identity, with anonymous as the floor. The
// distinction is operationally critical: enforcement policy can
// require agent_source='declared' before applying a hard deny.
const Schema = `
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
  decision TEXT NOT NULL DEFAULT 'allowed',
  agent_source TEXT NOT NULL DEFAULT 'anonymous'
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit(agent_id, ts);
`

// migrateDecisionColumn is the additive migration applied to existing
// v0.1.0b audit tables that pre-date the decision column. Executed
// best-effort in Open / FromDB; SQLite errors with "duplicate column"
// when the column already exists, which we treat as success.
const migrateDecisionColumn = `
ALTER TABLE audit ADD COLUMN decision TEXT NOT NULL DEFAULT 'allowed';
`

// idxDecision creates the decision-column index. Lives separately
// from Schema so it can run AFTER migrateDecision — for v0.1.0b DBs
// the column doesn't exist until migration completes.
const idxDecision = `
CREATE INDEX IF NOT EXISTS idx_audit_decision ON audit(decision);
`

// migrateAgentSourceColumn is the v0.1.0e additive migration. It
// adds the agent_source column to existing audit tables (v0.1.0b,
// v0.1.0c, v0.1.0d) with a 'anonymous' default so existing rows
// have a sensible value — they were written before process
// introspection existed, so "we don't know how that identity was
// attached" is the honest answer.
const migrateAgentSourceColumn = `
ALTER TABLE audit ADD COLUMN agent_source TEXT NOT NULL DEFAULT 'anonymous';
`

// idxAgentSource creates the agent_source index. Lives separately
// from Schema for the same reason as idxDecision: the column
// doesn't exist until ALTER TABLE completes for pre-v0.1.0e DBs.
const idxAgentSource = `
CREATE INDEX IF NOT EXISTS idx_audit_agent_source ON audit(agent_source, ts);
`


// Direction is one of "client" or "server" — the side a message was
// observed coming from. Constrained by a SQLite CHECK so a typo at the
// call site fails loud.
type Direction string
const (
	DirClient Direction = "client"
	DirServer Direction = "server"
)

// Event is one parsed Postgres message about to be written to the audit
// table. AgentID/AgentName are empty when no identity is attached
// (identity verification failure is non-fatal — observability before
// enforcement).
//
// Decision records the proxy's outcome for the message: "allowed"
// (default — message forwarded normally), "rate_limited" (queued in
// a rate-limit bucket then forwarded), or "coalesced" (response
// served from the per-agent cache, never forwarded to upstream).
// Empty Decision is treated as "allowed" by Write.
//
// AgentSource records how AgentID/AgentName were attached:
//   - "declared":  Tier-2 signed identity from application_name=vigil:<token>
//   - "inferred":  Tier-1 unsigned identity from process-tree introspection
//   - "anonymous": neither path attached an identity
//
// Empty AgentSource is treated as "anonymous" by Write. The
// distinction matters for the future policy engine: only declared
// identities are safe to enforce against, because inferred
// identities can be spoofed by a process changing its name.
type Event struct {
	Timestamp   time.Time
	AgentID     string
	AgentName   string
	ConnID      string
	Direction   Direction
	MsgType     string
	QueryText   string
	Bytes       int
	Decision    string
	AgentSource string
}
// Signer is the minimal subset of *identity.Issuer that audit needs.
// We don't import identity here to keep the dependency one-way (the
// pgproxy package can wire an issuer in without the audit package
// reaching back into identity).
type Signer interface {
	SignRaw(payload []byte) []byte
}
// Ed25519Signer wraps an ed25519.PrivateKey for use as a Signer.
// Tests use this directly; production wires the issuer's private key
// through a thin adapter.
type Ed25519Signer struct {
	Key ed25519.PrivateKey
}
// SignRaw produces an Ed25519 signature over the canonical payload.
func (s *Ed25519Signer) SignRaw(payload []byte) []byte {
	return ed25519.Sign(s.Key, payload)
}
// Writer persists Events. The default implementation is *DBWriter, a
// SQLite-backed writer that opens (or creates) the audit table and
// signs each row in-band. Tests can substitute an in-memory Writer.
type Writer interface {
	Write(ev Event) error
	Close() error
}
// DBWriter writes audit rows to a SQLite database. Safe for use from
// the per-connection pump goroutine — internally it serializes writes
// behind a sync.Mutex so multiple connections can share one Writer.
//
// We do not use a connection pool's natural concurrency: every audit
// write is a small, fast statement, and serialization makes the per-
// row signing predictable. If audit-write throughput becomes a
// bottleneck, switch to channel + dedicated goroutine; the contract
// here lets us swap without touching the pump.
type DBWriter struct {
	mu     sync.Mutex
	db     *sql.DB
	signer Signer
	ownsDB bool // true if Open created the DB; controls Close behavior
}
// Open opens or creates a SQLite database at path, ensures the audit
// schema exists, and returns a DBWriter that signs rows with signer.
func Open(path string, signer Signer) (*DBWriter, error) {
	if path == "" {
		return nil, errors.New("audit: db path is required")
	}
	if signer == nil {
		return nil, errors.New("audit: signer is required")
	}
	// WAL + busy_timeout: the audit table is written by the pump goroutine
	// and read by tests / future overview UI. Default rolling-journal mode
	// locks the DB during writes, producing SQLITE_BUSY for concurrent
	// readers. WAL allows concurrent reads, and busy_timeout serializes
	// the rare writer contention rather than erroring out immediately.
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("audit: open sqlite %s: %w", path, err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("audit: ping sqlite %s: %w", path, err)
	}
	if _, err := db.Exec(Schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("audit: init schema: %w", err)
	}
	if err := migrateDecision(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := migrateAgentSource(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &DBWriter{db: db, signer: signer, ownsDB: true}, nil
}
// FromDB constructs a DBWriter on an already-open *sql.DB. The schema
// is ensured. Close() does NOT close the underlying *sql.DB — the
// caller owns it. Useful when the proxy already holds the identity
// store's *sql.DB and wants to share the same file.
func FromDB(db *sql.DB, signer Signer) (*DBWriter, error) {
	if db == nil {
		return nil, errors.New("audit: db is required")
	}
	if signer == nil {
		return nil, errors.New("audit: signer is required")
	}
	if _, err := db.Exec(Schema); err != nil {
		return nil, fmt.Errorf("audit: init schema: %w", err)
	}
	if err := migrateDecision(db); err != nil {
		return nil, err
	}
	if err := migrateAgentSource(db); err != nil {
		return nil, err
	}
	return &DBWriter{db: db, signer: signer, ownsDB: false}, nil
}

// migrateDecision adds the decision column to v0.1.0b audit tables
// that pre-date it, then ensures the decision index exists. The
// CREATE TABLE in Schema is idempotent and includes the column for
// fresh installs; this migration handles the upgrade path for
// existing databases. SQLite reports "duplicate column" when the
// column is already present — that's success.
//
// The index lives outside Schema because for v0.1.0b DBs the column
// doesn't exist until ALTER TABLE completes — Schema's index would
// fail to compile against the pre-migration table shape.
func migrateDecision(db *sql.DB) error {
	if _, err := db.Exec(migrateDecisionColumn); err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("audit: add decision column: %w", err)
		}
	}
	if _, err := db.Exec(idxDecision); err != nil {
		return fmt.Errorf("audit: create decision index: %w", err)
	}
	return nil
}

// migrateAgentSource adds the agent_source column to pre-v0.1.0e
// audit tables, then ensures the agent_source index exists. Mirrors
// migrateDecision's shape exactly — same idempotency guarantee,
// same "duplicate column" tolerance, same separated index because
// pre-migration the column doesn't exist.
//
// Existing rows are backfilled to 'anonymous' (the column default);
// the audit packagee cannot retroactively know whether a v0.1.0d
// row had declared or inferred identity, so "anonymous" is the
// honest answer for them. New rows carry the correct source.
func migrateAgentSource(db *sql.DB) error {
	if _, err := db.Exec(migrateAgentSourceColumn); err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("audit: add agent_source column: %w", err)
		}
	}
	if _, err := db.Exec(idxAgentSource); err != nil {
		return fmt.Errorf("audit: create agent_source index: %w", err)
	}
	return nil
}
// Close releases the underlying database handle if Open created it.
// FromDB-constructed writers are no-ops on Close.
func (w *DBWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.db == nil {
		return nil
	}
	if !w.ownsDB {
		w.db = nil
		return nil
	}
	err := w.db.Close()
	w.db = nil
	return err
}
// Write persists a single audit Event with a signed canonical row.
//
// The timestamp on the event must be set by the caller — using
// time.Now() inside Write would make tests fragile and makes ordering
// across connections harder to reason about than threading the
// caller's wall clock through.
func (w *DBWriter) Write(ev Event) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.db == nil {
		return errors.New("audit: writer closed")
	}
	if ev.ConnID == "" {
		return errors.New("audit: conn_id is required")
	}
	if ev.MsgType == "" {
		return errors.New("audit: msg_type is required")
	}
	if ev.Direction != DirClient && ev.Direction != DirServer {
		return fmt.Errorf("audit: invalid direction %q", ev.Direction)
	}
	ts := ev.Timestamp.UTC().Format("2006-01-02T15:04:05.000Z")
	canonical := CanonicalForm(ev.AgentID, ev.ConnID, ts, ev.MsgType, ev.QueryText)
	sig := base64.RawStdEncoding.EncodeToString(w.signer.SignRaw([]byte(canonical)))
	const q = `
		INSERT INTO audit (ts, agent_id, agent_name, conn_id, direction, msg_type, query_text, bytes, sig, decision, agent_source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	var (
		agentID   any = nil
		agentName any = nil
		queryText any = nil
	)
	if ev.AgentID != "" {
		agentID = ev.AgentID
	}
	if ev.AgentName != "" {
		agentName = ev.AgentName
	}
	if ev.QueryText != "" {
		queryText = ev.QueryText
	}
	decision := ev.Decision
	if decision == "" {
		decision = "allowed"
	}
	agentSource := ev.AgentSource
	if agentSource == "" {
		agentSource = "anonymous"
	}
	_, err := w.db.Exec(q,
		ts,
		agentID,
		agentName,
		ev.ConnID,
		string(ev.Direction),
		ev.MsgType,
		queryText,
		ev.Bytes,
		sig,
		decision,
		agentSource,
	)
	if err != nil {
		return fmt.Errorf("audit: write: %w", err)
	}
	return nil
}
// CanonicalForm produces the deterministic, signature-input string for
// an audit row. Format (per spec):
//
//	agent_id|conn_id|ts|msg_type|len(query_text)|sha256(query_text)
//
// Empty agent_id/query_text are encoded as empty strings between the
// pipes; sha256 of an empty string is the standard
// e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
func CanonicalForm(agentID, connID, ts, msgType, queryText string) string {
	sum := sha256.Sum256([]byte(queryText))
	return agentID + "|" + connID + "|" + ts + "|" + msgType + "|" +
		strconv.Itoa(len(queryText)) + "|" + hex.EncodeToString(sum[:])
}
// Verify returns nil iff sigB64 is a valid Ed25519 signature over the
// canonical form of the row identified by the column inputs. Used by
// tests and by the audit-replay path in Tauri / MCP. Caller supplies
// the public key (the issuer's pubkey, exposed via Issuer.PublicKeyB64).
func Verify(pub ed25519.PublicKey, sigB64 string, agentID, connID, ts, msgType, queryText string) error {
	sig, err := base64.RawStdEncoding.DecodeString(sigB64)
	if err != nil {
		return fmt.Errorf("audit: decode sig: %w", err)
	}
	canonical := CanonicalForm(agentID, connID, ts, msgType, queryText)
	if !ed25519.Verify(pub, []byte(canonical), sig) {
		return errors.New("audit: invalid signature")
	}
	return nil
}
