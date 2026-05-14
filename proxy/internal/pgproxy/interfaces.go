package pgproxy

import "context"

// Decision is the outcome of message-level proxy logic for a single
// client-originated frame. Recorded on the audit row so the dashboard
// can distinguish messages that flowed through normally from those
// rate-limited or served from the coalescing cache.
//
// v0.1.0b ships with all decisions defaulting to DecisionAllowed.
// v0.1.0c populates DecisionRateLimited via the RateLimiter interface.
// v0.1.0d populates DecisionCoalesced via the Coalescer interface.
type Decision string

const (
	// DecisionAllowed is the default — the message was forwarded to
	// upstream without throttling or cache substitution.
	DecisionAllowed Decision = "allowed"

	// DecisionRateLimited indicates the message waited in a rate-limit
	// bucket before being forwarded. The message still completes; this
	// is back-pressure, not rejection.
	DecisionRateLimited Decision = "rate_limited"

	// DecisionCoalesced indicates the response was served from a
	// per-agent query cache without forwarding to upstream. Only valid
	// for read-only SELECT/WITH outside an explicit transaction.
	DecisionCoalesced Decision = "coalesced"
)

// RateLimiter is consulted before each client→upstream Postgres frame
// is forwarded. Implementations enforce per-agent and per-pool token
// buckets; pgproxy threads the returned Decision into the audit row.
//
// Acquire blocks until a token is available or ctx is canceled. The
// only error path in v0.1.0c is ctx.Err(); permanent rejection is a
// future capability.
//
// Implementation lives in proxy/internal/ratelimit/ (Agent 1, push
// 2026-05-15). Server.RateLimiter is nil-by-default; nil means no
// rate limiting (all calls return DecisionAllowed implicitly).
type RateLimiter interface {
	Acquire(ctx context.Context, agentID, route string) (Decision, error)
}

// Coalescer is consulted before forwarding read-only Query/Parse
// frames whose connection is at txDepth==0. On Lookup hit pgproxy
// writes the cached upstream-response bytes back to the client and
// records DecisionCoalesced; on miss it forwards normally and the
// captured response bytes are passed to Store for the next caller.
//
// Implementations are per-agent only — never share cache entries
// across agentID boundaries (RLS, search_path, role membership all
// vary). Anonymous connections (agentID=="") MUST NOT be coalesced.
//
// Implementation lives in proxy/internal/coalesce/ (Agent 2, push
// 2026-05-15). Server.Coalescer is nil-by-default; nil means no
// coalescing (every query reaches upstream).
type Coalescer interface {
	// Lookup returns previously-stored upstream response bytes and
	// true if the (agentID, key) pair is present and unexpired.
	Lookup(agentID string, key CacheKey) (response []byte, hit bool)

	// Store records a captured upstream response under (agentID, key)
	// with the implementation's configured TTL. Implementations are
	// expected to bound memory (LRU eviction at the per-agent level).
	Store(agentID string, key CacheKey, response []byte)
}

// CacheKey identifies a unique query within a given agent's cache
// scope. Database and User come from the connection's StartupMessage
// parameters and constrain results to the right Postgres role.
//
// QueryText must be canonicalized by the Coalescer implementation
// (whitespace collapsed, trailing semicolons stripped) — pgproxy
// passes the raw query string. Params is the wire-format payload of
// the most recent Bind for extended-protocol queries; nil for simple
// Query messages.
type CacheKey struct {
	QueryText string
	Params    [][]byte
	Database  string
	User      string
}
