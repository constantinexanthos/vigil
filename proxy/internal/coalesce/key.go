// Package coalesce implements the per-agent query response cache that
// the proxy consults before forwarding SELECT/WITH statements upstream.
//
// The interface is pgproxy.Coalescer (see the lead-agent prep PR).
// Until that lands the implementation is self-contained and tested at
// the package level — the integration is a one-line wire in main.go.
//
// Safety boundaries enforced here (NOT by the proxy):
//   - per-agent isolation (anonymous agent_id never coalesces)
//   - normalized cache keys (whitespace, trailing semis)
//   - deny-list of side-effecting / non-deterministic queries
//   - 256KB per-response cap
//   - per-agent LRU with configurable bound
//   - lazy TTL eviction on Lookup
//
// The proxy is still responsible for the dynamic checks it owns:
//   - transaction depth == 0 (only consult Coalescer outside BEGIN/COMMIT)
//   - statement type (only Query/Parse-Bind-Execute paths)
//   - response capture (the raw upstream bytes that Lookup hands back)
package coalesce

import (
	"strings"
	"unicode"
)

// NormalizeQuery applies the canonicalization rules from the design doc.
// Identical canonicalized strings → identical cache keys.
//
// Rules (in order):
//  1. Trim leading and trailing whitespace.
//  2. Collapse internal runs of whitespace to a single space.
//  3. Strip trailing semicolons (and any whitespace between/after them).
//
// Rules NOT applied (each is a correctness foot-gun):
//   - No lowercasing — Postgres treats `"User"` vs `"user"` distinctly.
//   - No comment stripping — `/*+ hint */` can change query plan.
func NormalizeQuery(q string) string {
	q = strings.TrimSpace(q)

	// Strip trailing semicolons (and any trailing whitespace they leave
	// behind). Doing this before whitespace-collapse means we don't
	// have to deal with "; " patterns inside the loop.
	for {
		trimmed := strings.TrimRight(q, "; \t\r\n")
		if trimmed == q {
			break
		}
		q = trimmed
	}

	// Collapse internal whitespace runs. Build into a new strings.Builder
	// rather than mutating in place — clearer and probably faster for
	// typical query lengths.
	var b strings.Builder
	b.Grow(len(q))
	inSpace := false
	for _, r := range q {
		if unicode.IsSpace(r) {
			if !inSpace {
				b.WriteByte(' ')
				inSpace = true
			}
			continue
		}
		b.WriteRune(r)
		inSpace = false
	}
	return b.String()
}

// denyListSubstrings — case-insensitive substring matches that disqualify
// a query from coalescing. Match runs against the already-lowercased
// canonical form (lowering once is cheaper than lowering N times in a
// loop). Each entry is documented with its hazard category.
var denyListSubstrings = []string{
	// Sequence functions — side effects on the sequence.
	"nextval(",
	"setval(",
	"currval(",
	// Non-deterministic — same query, different rows.
	"random()",
	"gen_random_uuid()",
	// Time-sensitive.
	"now()",
	"current_timestamp",
	"clock_timestamp()",
	"statement_timestamp()",
	// Context-sensitive (depends on session role, not query text).
	"current_user",
	"session_user",
	"current_role",
	// Lock acquisition.
	"pg_advisory_lock",
	"pg_advisory_unlock",
	"pg_try_advisory_lock",
	// Transaction metadata — value changes on every call by design.
	"pg_current_xact",
	"pg_snapshot_xact",
	"txid_",
	// Row-level locking SELECTs.
	"for update",
	"for share",
	"for no key update",
}

// AllowedByDenyList reports whether the normalized query text is safe to
// coalesce. On rejection it also returns the matched substring so the
// caller can log "info: skipped due to nextval(" — useful for tuning.
//
// Match is case-insensitive substring on a lowercased copy of the query.
// We accept the cost of a full lowercased copy (vs a streaming match)
// because the input is small (< few KB typical) and clarity matters.
func AllowedByDenyList(normalized string) (bool, string) {
	lower := strings.ToLower(normalized)
	// Multi-statement check: any ';' AFTER normalization (which already
	// stripped trailing semis) means there's a semicolon in the body —
	// either multi-statement or pathological input. Refuse to cache.
	if strings.Contains(normalized, ";") {
		return false, ";"
	}
	for _, sub := range denyListSubstrings {
		if strings.Contains(lower, sub) {
			return false, sub
		}
	}
	return true, ""
}

// IsCoalescableStatement reports whether the query is a SELECT or WITH
// (CTE). Anything else — INSERT/UPDATE/DELETE/DDL/BEGIN/COMMIT — must
// bypass the cache outright. Defensive against un-normalized input:
// leading whitespace is tolerated. Match is case-insensitive on the
// prefix.
func IsCoalescableStatement(q string) bool {
	trimmed := strings.TrimLeft(q, " \t\r\n")
	if len(trimmed) < 4 {
		return false
	}
	upper := strings.ToUpper(trimmed[:min(8, len(trimmed))])
	return strings.HasPrefix(upper, "SELECT ") ||
		strings.HasPrefix(upper, "SELECT\t") ||
		strings.HasPrefix(upper, "WITH ") ||
		strings.HasPrefix(upper, "WITH\t")
}
