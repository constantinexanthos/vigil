package coalesce

import "testing"

// Whitespace collapse + trailing-semi strip + no lowercasing + no
// comment stripping. Each rule is a separate test so when the regression
// surfaces, the assertion message points at exactly which rule broke.
//
// The non-obvious ones:
//   - DO NOT lowercase. Postgres treats `"User"` (quoted identifier) as
//     distinct from `"user"`. Lowercasing would silently change query
//     semantics and produce a "cache hit" that returns the wrong rows.
//   - DO NOT strip comments. A SQL comment can carry a planner hint
//     (`/*+ NoMergeJoin(t1 t2) */`) that changes execution plan and
//     therefore can change the result set in edge cases (timing-sensitive
//     concurrent queries). Treat the comment as part of the query.

func TestNormalizeTrimsLeadingAndTrailingWhitespace(t *testing.T) {
	got := NormalizeQuery("   SELECT 1   ")
	if got != "SELECT 1" {
		t.Errorf("got %q, want %q", got, "SELECT 1")
	}
}

func TestNormalizeCollapsesInternalWhitespaceRuns(t *testing.T) {
	got := NormalizeQuery("SELECT   *    FROM\tusers\n\nWHERE  email  =  $1")
	want := "SELECT * FROM users WHERE email = $1"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestNormalizeStripsTrailingSemicolons(t *testing.T) {
	if got := NormalizeQuery("SELECT 1;"); got != "SELECT 1" {
		t.Errorf("single trailing semi: got %q", got)
	}
	if got := NormalizeQuery("SELECT 1 ;;; "); got != "SELECT 1" {
		t.Errorf("multiple trailing semis + space: got %q", got)
	}
}

func TestNormalizePreservesCase(t *testing.T) {
	// "User" with capital U is a quoted-identifier-different table in
	// Postgres. Lowercasing it would cross-talk cache entries between
	// distinct tables.
	got := NormalizeQuery(`SELECT * FROM "User" WHERE Id = $1`)
	want := `SELECT * FROM "User" WHERE Id = $1`
	if got != want {
		t.Errorf("case preserved: got %q, want %q", got, want)
	}
}

func TestNormalizePreservesComments(t *testing.T) {
	// Comment carries a planner hint. The cache key MUST treat
	// commented and un-commented variants as distinct queries.
	hinted := NormalizeQuery("SELECT /*+ IndexScan(t pk) */ * FROM t WHERE id = 1")
	plain := NormalizeQuery("SELECT * FROM t WHERE id = 1")
	if hinted == plain {
		t.Errorf("comment stripped — got same key for hinted vs plain query")
	}
}

// Deny list: substring match (case-insensitive). When ANY of these
// substrings appear in the canonicalized query text, the query MUST
// NOT be coalesced.
//
// Why each is dangerous:
//   - sequence funcs (nextval/setval/currval): side effects on the
//     sequence; consecutive callers expect monotonic progress.
//   - random/uuid: non-deterministic — same query SHOULD return
//     different rows.
//   - now()/current_timestamp/clock_timestamp: time-sensitive.
//   - current_user/session_user/current_role: context-sensitive.
//   - pg_advisory_lock: actual lock acquisition.
//   - pg_*_xact / txid_*: transaction metadata.
//   - FOR UPDATE / FOR SHARE / FOR NO KEY UPDATE: row-level locking.

func TestDenyListBlocksSequenceFunctions(t *testing.T) {
	for _, q := range []string{
		"SELECT nextval('orders_id_seq')",
		"SELECT NEXTVAL('s')", // case-insensitive
		"SELECT setval('s', 100)",
		"SELECT currval('s')",
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksNonDeterministicFuncs(t *testing.T) {
	for _, q := range []string{
		"SELECT random()",
		"SELECT gen_random_uuid()",
		"SELECT GEN_RANDOM_UUID()", // case-insensitive
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksTimeSensitiveFuncs(t *testing.T) {
	for _, q := range []string{
		"SELECT now()",
		"SELECT NOW()",
		"SELECT current_timestamp",
		"SELECT clock_timestamp()",
		"SELECT statement_timestamp()",
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksContextSensitive(t *testing.T) {
	for _, q := range []string{
		"SELECT current_user",
		"SELECT session_user",
		"SELECT current_role",
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksAdvisoryLocks(t *testing.T) {
	for _, q := range []string{
		"SELECT pg_advisory_lock(1)",
		"SELECT pg_advisory_unlock(1)",
		"SELECT pg_try_advisory_lock(1)",
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksTransactionMetadata(t *testing.T) {
	for _, q := range []string{
		"SELECT pg_current_xact_id()",
		"SELECT txid_current()",
		"SELECT pg_snapshot_xact()",
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksLockingSelects(t *testing.T) {
	for _, q := range []string{
		"SELECT * FROM users WHERE id = 1 FOR UPDATE",
		"select * from users for share",
		"SELECT * FROM t FOR NO KEY UPDATE",
	} {
		if ok, _ := AllowedByDenyList(q); ok {
			t.Errorf("expected deny: %q", q)
		}
	}
}

func TestDenyListBlocksMultiStatement(t *testing.T) {
	// A semicolon INSIDE the body (not trailing — trailing is stripped
	// by normalization) means multi-statement. Cannot coalesce.
	q := "SELECT 1; SELECT 2"
	if ok, _ := AllowedByDenyList(q); ok {
		t.Errorf("expected deny on multi-statement: %q", q)
	}
}

func TestDenyListAllowsCleanSelects(t *testing.T) {
	for _, q := range []string{
		"SELECT 1",
		"SELECT * FROM users WHERE email = $1",
		"SELECT id, name FROM users WHERE id IN (1, 2, 3)",
		"WITH x AS (SELECT 1) SELECT * FROM x",
	} {
		if ok, _ := AllowedByDenyList(q); !ok {
			t.Errorf("expected allow: %q", q)
		}
	}
}

// Only SELECT and WITH-prefixed queries are coalescable. INSERT,
// UPDATE, DELETE, DDL all bypass the cache outright. The check is
// case-insensitive and tolerates leading whitespace (the caller may
// pass un-normalized input — IsCoalescableStatement is defensive).
func TestIsCoalescableStatementAcceptsSelectAndWith(t *testing.T) {
	for _, q := range []string{
		"SELECT 1",
		"select * from t",
		"  SELECT 1",
		"WITH x AS (SELECT 1) SELECT * FROM x",
		"With x AS (SELECT 1) SELECT * FROM x",
	} {
		if !IsCoalescableStatement(q) {
			t.Errorf("expected coalescable: %q", q)
		}
	}
}

func TestIsCoalescableStatementRejectsMutations(t *testing.T) {
	for _, q := range []string{
		"INSERT INTO t VALUES (1)",
		"update users set name = 'x'",
		"DELETE FROM t",
		"CREATE TABLE t (id int)",
		"DROP TABLE t",
		"BEGIN",
		"COMMIT",
		"ROLLBACK",
	} {
		if IsCoalescableStatement(q) {
			t.Errorf("expected NOT coalescable: %q", q)
		}
	}
}
