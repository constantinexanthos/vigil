package identity

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite" // pure-Go driver, no CGO required
)

// SQLiteStore persists Identities in a SQLite database. Replaces MemStore
// as the v0.0.2 default — without persistence, every restart of the
// daemon invalidates every previously-issued token.
//
// Timestamps are stored as RFC3339 strings, NOT SQLite's native datetime()
// shape. The Vigil daemon's events table hit a lex-compare bug when
// queries wrapped timestamp columns in datetime() (issue #1) — keeping
// RFC3339 here means range queries against IssuedAt sort the way you'd
// expect, lexicographically.
type SQLiteStore struct {
	db *sql.DB
}

// OpenSQLiteStore opens (or creates) a SQLite-backed Store at `path`.
// The path's parent directory must exist.
func OpenSQLiteStore(path string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("identity: open sqlite %s: %w", path, err)
	}
	// Verify the connection works before returning — sql.Open is lazy.
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("identity: ping sqlite %s: %w", path, err)
	}
	if err := initSQLiteSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &SQLiteStore{db: db}, nil
}

// Close releases the underlying database handle. Safe to call multiple times.
func (s *SQLiteStore) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func initSQLiteSchema(db *sql.DB) error {
	const schema = `
	CREATE TABLE IF NOT EXISTS identities (
		id          TEXT PRIMARY KEY,
		agent_name  TEXT NOT NULL,
		principal   TEXT NOT NULL,
		scopes      TEXT NOT NULL,
		public_key  TEXT NOT NULL,
		issued_at   TEXT NOT NULL,
		expires_at  TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_identities_issued_at ON identities(issued_at DESC);
	`
	if _, err := db.Exec(schema); err != nil {
		return fmt.Errorf("identity: init sqlite schema: %w", err)
	}
	return nil
}

// Save inserts or replaces an identity row. Same contract as MemStore.
func (s *SQLiteStore) Save(id Identity) error {
	scopesJSON, err := json.Marshal(id.Scopes)
	if err != nil {
		return fmt.Errorf("identity: marshal scopes: %w", err)
	}
	const q = `
		INSERT INTO identities (id, agent_name, principal, scopes, public_key, issued_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			agent_name = excluded.agent_name,
			principal  = excluded.principal,
			scopes     = excluded.scopes,
			public_key = excluded.public_key,
			issued_at  = excluded.issued_at,
			expires_at = excluded.expires_at
	`
	_, err = s.db.Exec(q,
		id.ID,
		id.AgentName,
		id.Principal,
		string(scopesJSON),
		id.PublicKey,
		id.IssuedAt.UTC().Format(time.RFC3339Nano),
		id.ExpiresAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("identity: save %s: %w", id.ID, err)
	}
	return nil
}

// Get fetches by id; returns ErrNotFound if no row matches.
func (s *SQLiteStore) Get(id string) (Identity, error) {
	const q = `
		SELECT id, agent_name, principal, scopes, public_key, issued_at, expires_at
		FROM identities WHERE id = ?
	`
	row := s.db.QueryRow(q, id)
	out, err := scanIdentity(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return Identity{}, ErrNotFound
	}
	if err != nil {
		return Identity{}, fmt.Errorf("identity: get %s: %w", id, err)
	}
	return out, nil
}

// List returns all identities, most-recent-first by issued_at.
func (s *SQLiteStore) List() ([]Identity, error) {
	const q = `
		SELECT id, agent_name, principal, scopes, public_key, issued_at, expires_at
		FROM identities ORDER BY issued_at DESC
	`
	rows, err := s.db.Query(q)
	if err != nil {
		return nil, fmt.Errorf("identity: list: %w", err)
	}
	defer rows.Close()

	var out []Identity
	for rows.Next() {
		v, err := scanIdentity(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("identity: scan list row: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("identity: list rows: %w", err)
	}
	return out, nil
}

// scanIdentity is shared by Get and List. Takes a Scan-shaped function so
// we can use it with both *sql.Row and *sql.Rows.
func scanIdentity(scan func(...any) error) (Identity, error) {
	var (
		id       Identity
		scopes   string
		issued   string
		expires  string
	)
	if err := scan(
		&id.ID,
		&id.AgentName,
		&id.Principal,
		&scopes,
		&id.PublicKey,
		&issued,
		&expires,
	); err != nil {
		return Identity{}, err
	}
	if err := json.Unmarshal([]byte(scopes), &id.Scopes); err != nil {
		return Identity{}, fmt.Errorf("unmarshal scopes %q: %w", scopes, err)
	}
	t, err := time.Parse(time.RFC3339Nano, issued)
	if err != nil {
		return Identity{}, fmt.Errorf("parse issued_at %q: %w", issued, err)
	}
	id.IssuedAt = t
	t, err = time.Parse(time.RFC3339Nano, expires)
	if err != nil {
		return Identity{}, fmt.Errorf("parse expires_at %q: %w", expires, err)
	}
	id.ExpiresAt = t
	return id, nil
}
