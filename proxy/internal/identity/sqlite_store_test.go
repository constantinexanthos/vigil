package identity

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

// Compile-time assertion: SQLiteStore must satisfy the Store interface.
// If it doesn't, this line fails to compile — much louder than a runtime
// surprise the first time someone wires it into Service.
var _ Store = (*SQLiteStore)(nil)

func newTestSQLiteStore(t *testing.T) *SQLiteStore {
	t.Helper()
	dir := t.TempDir()
	store, err := OpenSQLiteStore(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("OpenSQLiteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

// Round-trip: a saved identity comes back identical from Get, with all
// fields preserved. Especially the slice-typed Scopes field — the
// implementation marshals it to JSON for the column, so a tabular bug
// would silently change the value.
func TestSQLiteStoreSaveAndGetRoundTrip(t *testing.T) {
	store := newTestSQLiteStore(t)

	now := time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC)
	id := Identity{
		ID:        "abc-123",
		AgentName: "claude-code",
		Principal: "costa@example.com",
		Scopes:    []string{"read", "write"},
		PublicKey: "fake-pub-key-b64",
		IssuedAt:  now,
		ExpiresAt: now.Add(24 * time.Hour),
	}
	if err := store.Save(id); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := store.Get("abc-123")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != id.ID {
		t.Errorf("id = %q, want %q", got.ID, id.ID)
	}
	if got.AgentName != id.AgentName {
		t.Errorf("agent = %q, want %q", got.AgentName, id.AgentName)
	}
	if got.Principal != id.Principal {
		t.Errorf("principal = %q, want %q", got.Principal, id.Principal)
	}
	if got.PublicKey != id.PublicKey {
		t.Errorf("pubkey = %q, want %q", got.PublicKey, id.PublicKey)
	}
	if !got.IssuedAt.Equal(id.IssuedAt) {
		t.Errorf("issued_at = %v, want %v", got.IssuedAt, id.IssuedAt)
	}
	if !got.ExpiresAt.Equal(id.ExpiresAt) {
		t.Errorf("expires_at = %v, want %v", got.ExpiresAt, id.ExpiresAt)
	}
	if len(got.Scopes) != 2 || got.Scopes[0] != "read" || got.Scopes[1] != "write" {
		t.Errorf("scopes = %v, want [read write]", got.Scopes)
	}
}

// List returns most-recent-first by IssuedAt — same contract as MemStore,
// since the HTTP handler renders directly from List output.
func TestSQLiteStoreListOrdersMostRecentFirst(t *testing.T) {
	store := newTestSQLiteStore(t)

	older := Identity{
		ID:        "old",
		AgentName: "first",
		Principal: "p",
		IssuedAt:  time.Date(2026, 5, 4, 9, 0, 0, 0, time.UTC),
		ExpiresAt: time.Date(2026, 5, 5, 9, 0, 0, 0, time.UTC),
	}
	newer := Identity{
		ID:        "new",
		AgentName: "second",
		Principal: "p",
		IssuedAt:  time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC),
		ExpiresAt: time.Date(2026, 5, 5, 10, 0, 0, 0, time.UTC),
	}
	// Insert in reverse-chronological order; persistence must not depend
	// on insertion order to compute the result.
	if err := store.Save(older); err != nil {
		t.Fatalf("Save older: %v", err)
	}
	if err := store.Save(newer); err != nil {
		t.Fatalf("Save newer: %v", err)
	}

	xs, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 2 {
		t.Fatalf("len = %d, want 2", len(xs))
	}
	if xs[0].ID != "new" {
		t.Errorf("first = %q, want new (most-recent first)", xs[0].ID)
	}
	if xs[1].ID != "old" {
		t.Errorf("second = %q, want old", xs[1].ID)
	}
}

// Get for an id we never saved must return ErrNotFound (not a generic
// SQL no-rows error). Service.handleGet relies on errors.Is(err,
// ErrNotFound) to map to 404.
func TestSQLiteStoreGetMissingReturnsErrNotFound(t *testing.T) {
	store := newTestSQLiteStore(t)
	_, err := store.Get("nope")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

// Persistence across reopens — the whole point of moving off MemStore.
// Save in one Store handle, close it, reopen at the same path, expect the
// row to be there.
func TestSQLiteStorePersistsAcrossReopens(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "persist.db")

	now := time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC)
	id := Identity{
		ID: "pid", AgentName: "x", Principal: "p",
		IssuedAt: now, ExpiresAt: now.Add(time.Hour),
	}

	first, err := OpenSQLiteStore(path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	if err := first.Save(id); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	second, err := OpenSQLiteStore(path)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	defer second.Close()

	got, err := second.Get("pid")
	if err != nil {
		t.Fatalf("Get after reopen: %v", err)
	}
	if got.ID != "pid" {
		t.Errorf("id = %q, want pid", got.ID)
	}
}

// Save with an existing id replaces the row — same contract as MemStore.
// Without this, re-issuing under the same id would error (UNIQUE) instead
// of overwriting.
func TestSQLiteStoreSaveReplacesExisting(t *testing.T) {
	store := newTestSQLiteStore(t)
	now := time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC)

	first := Identity{ID: "same", AgentName: "v1", Principal: "p", IssuedAt: now, ExpiresAt: now.Add(time.Hour)}
	if err := store.Save(first); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	second := Identity{ID: "same", AgentName: "v2", Principal: "p", IssuedAt: now, ExpiresAt: now.Add(time.Hour)}
	if err := store.Save(second); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	got, err := store.Get("same")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.AgentName != "v2" {
		t.Errorf("agent = %q, want v2", got.AgentName)
	}
}
