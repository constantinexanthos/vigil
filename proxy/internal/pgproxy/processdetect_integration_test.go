package pgproxy

import (
	"context"
	"database/sql"
	"errors"
	"net"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"
	_ "modernc.org/sqlite"

	"github.com/costaxanthos/vigil/proxy/internal/audit"
	"github.com/costaxanthos/vigil/proxy/internal/identity"
	"github.com/costaxanthos/vigil/proxy/internal/processdetect"
)

// stubProcessDetector returns a fixed DetectedIdentity for every
// DetectFromConn call. Lets the test scripts the inferred-identity
// path without actually walking the host's process tree.
type stubProcessDetector struct {
	id  processdetect.DetectedIdentity
	err error
	hit int // increments each call; tests can assert it ran
}

func (s *stubProcessDetector) DetectFromConn(net.Conn) (processdetect.DetectedIdentity, error) {
	s.hit++
	return s.id, s.err
}

// stubRateLimiter records every (agentID, route) it was called with,
// always returning DecisionAllowed. Tests use it to assert the
// bucket-key string pgproxy passed in.
type stubRateLimiter struct {
	calls []rlCall
}

type rlCall struct {
	agentID string
	route   string
}

func (s *stubRateLimiter) Acquire(_ context.Context, agentID, route string) (Decision, error) {
	s.calls = append(s.calls, rlCall{agentID: agentID, route: route})
	return DecisionAllowed, nil
}

// startProxyWithDetect boots a pgproxy.Server with the supplied
// ProcessDetector, IdentityVerifier, and RateLimiter wired in.
// Returns the proxy address, the audit DB path, and a cleanup.
func startProxyWithDetect(
	t *testing.T,
	dial func(ctx context.Context) (net.Conn, error),
	verifier Verifier,
	signer audit.Signer,
	detector ProcessDetector,
	rl RateLimiter,
) (proxyAddr, dbPath string, cleanup func()) {
	t.Helper()
	dbPath = filepath.Join(t.TempDir(), "audit.db")
	w, err := audit.Open(dbPath, signer)
	if err != nil {
		t.Fatalf("open audit: %v", err)
	}

	srv := &Server{
		ListenAddr:       "127.0.0.1:0",
		UpstreamAddr:     "127.0.0.1:0", // unused when DialUpstream is set
		Logger:           silentLogger{},
		DialUpstream:     dial,
		AuditWriter:      w,
		IdentityVerifier: verifier,
		ProcessDetector:  detector,
		RateLimiter:      rl,
	}
	ctx, cancel := context.WithCancel(context.Background())

	ready := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		go func() {
			deadline := time.Now().Add(2 * time.Second)
			for time.Now().Before(deadline) {
				if a := srv.Addr(); a != nil {
					proxyAddr = a.String()
					close(ready)
					return
				}
				time.Sleep(5 * time.Millisecond)
			}
			close(ready)
		}()
		done <- srv.ListenAndServe(ctx)
	}()
	<-ready
	if proxyAddr == "" {
		cancel()
		t.Fatalf("proxy never bound")
	}
	cleanup = func() {
		cancel()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Errorf("proxy ListenAndServe did not return after cancel")
		}
		_ = w.Close()
	}
	return proxyAddr, dbPath, cleanup
}

// minimalUpstreamHandler completes startup with ReadyForQuery and
// echoes back a CommandComplete + ReadyForQuery for any client query.
// Used as the default fake upstream for these tests.
func minimalUpstreamHandler(t *testing.T, be *pgproto3.Backend, _ net.Conn) {
	if _, err := be.ReceiveStartupMessage(); err != nil {
		return
	}
	be.Send(&pgproto3.AuthenticationOk{})
	be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
	if err := be.Flush(); err != nil {
		return
	}
	for {
		msg, err := be.Receive()
		if err != nil {
			return
		}
		if _, ok := msg.(*pgproto3.Query); ok {
			be.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 1")})
			be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
			_ = be.Flush()
		}
		if _, ok := msg.(*pgproto3.Terminate); ok {
			return
		}
	}
}

// TestInferredIdentityWritesAgentSourceInferred is the core
// acceptance test for sub-project B: a connection with no
// application_name token but a non-empty ProcessDetector result
// produces audit rows with agent_source='inferred' and agent_name
// equal to the detected slug. agent_id stays NULL.
func TestInferredIdentityWritesAgentSourceInferred(t *testing.T) {
	t.Parallel()
	upstream := newFakeUpstream(t, minimalUpstreamHandler)
	_, signer := newAuditSigner(t)

	detector := &stubProcessDetector{
		id: processdetect.DetectedIdentity{
			AgentName:   "cursor",
			HarnessName: "cursor.app",
			Confidence:  "high",
		},
	}

	proxyAddr, dbPath, stop := startProxyWithDetect(t, upstream.dial, nil, signer, detector, nil)
	defer stop()

	conn, fe := dialClientWithApp(t, proxyAddr, "") // no token
	// Wait for ReadyForQuery, then send one query and disconnect.
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT inferred"})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush query: %v", err)
	}
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready after query: %v", err)
	}
	_ = conn.Close()

	if detector.hit == 0 {
		t.Fatalf("ProcessDetector.DetectFromConn was never called")
	}

	// Audit row check: the Query should have agent_source='inferred',
	// agent_name='cursor', agent_id NULL.
	gotSource, gotName, gotID := queryFirstQueryAudit(t, dbPath)
	if gotSource != "inferred" {
		t.Errorf("agent_source = %q, want \"inferred\"", gotSource)
	}
	if gotName != "cursor" {
		t.Errorf("agent_name = %q, want \"cursor\"", gotName)
	}
	if gotID.Valid {
		t.Errorf("agent_id should be NULL for inferred, got %q", gotID.String)
	}
}

// TestDeclaredIdentityWinsOverInferred verifies the decision tree:
// when both a valid declared token AND a non-empty detector result
// are present, declared identity is written and agent_source is
// 'declared'. This is the load-bearing invariant — Tier-2 always
// beats Tier-1.
func TestDeclaredIdentityWinsOverInferred(t *testing.T) {
	t.Parallel()
	upstream := newFakeUpstream(t, minimalUpstreamHandler)

	iss, err := identity.NewIssuer()
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	id, tok, err := iss.Issue(identity.IssueRequest{
		AgentName: "claude-code-declared",
		Principal: "alice@example.com",
		Scopes:    []string{"read"},
		TTL:       "1h",
	})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	// Detector would say "cursor" — but declared identity should
	// override.
	detector := &stubProcessDetector{
		id: processdetect.DetectedIdentity{
			AgentName:   "cursor",
			HarnessName: "cursor.app",
			Confidence:  "high",
		},
	}

	proxyAddr, dbPath, stop := startProxyWithDetect(
		t, upstream.dial, iss, &auditSignerWrap{iss: iss}, detector, nil,
	)
	defer stop()

	conn, fe := dialClientWithApp(t, proxyAddr, "vigil:"+tok.Token)
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT declared"})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush query: %v", err)
	}
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready after query: %v", err)
	}
	_ = conn.Close()

	gotSource, gotName, gotID := queryFirstQueryAudit(t, dbPath)
	if gotSource != "declared" {
		t.Errorf("agent_source = %q, want \"declared\"", gotSource)
	}
	if gotName != "claude-code-declared" {
		t.Errorf("agent_name = %q, want \"claude-code-declared\"", gotName)
	}
	if !gotID.Valid || gotID.String != id.ID {
		t.Errorf("agent_id = %v, want %q", gotID, id.ID)
	}
}

// TestNeitherIdentityWritesAnonymous is the fallback case: no
// declared token, detector returns empty, audit rows carry
// agent_source='anonymous' and both agent_id and agent_name are NULL.
func TestNeitherIdentityWritesAnonymous(t *testing.T) {
	t.Parallel()
	upstream := newFakeUpstream(t, minimalUpstreamHandler)
	_, signer := newAuditSigner(t)

	// Detector returns empty (the production behaviour when the
	// process is sandboxed or unresolvable).
	detector := &stubProcessDetector{
		id: processdetect.DetectedIdentity{},
	}

	proxyAddr, dbPath, stop := startProxyWithDetect(t, upstream.dial, nil, signer, detector, nil)
	defer stop()

	conn, fe := dialClientWithApp(t, proxyAddr, "")
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT anonymous"})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush query: %v", err)
	}
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready after query: %v", err)
	}
	_ = conn.Close()

	gotSource, gotName, gotID := queryFirstQueryAudit(t, dbPath)
	if gotSource != "anonymous" {
		t.Errorf("agent_source = %q, want \"anonymous\"", gotSource)
	}
	if gotName != "" {
		t.Errorf("agent_name = %q, want empty", gotName)
	}
	if gotID.Valid {
		t.Errorf("agent_id should be NULL, got %q", gotID.String)
	}
}

// TestInferredIdentityBucketsByAgentName confirms the RateLimiter
// receives the "inferred:<agentName>" key. This is the contract
// between pgproxy.rateLimitBucketKey and ratelimit.Limiter: an
// inferred Cursor connection drains a Cursor-specific bucket, not
// the anonymous one. Without this, the proxy would lump all
// inferred traffic into unauth and the "per-agent rate limiting
// for inferred identities" acceptance test fails.
func TestInferredIdentityBucketsByAgentName(t *testing.T) {
	t.Parallel()
	upstream := newFakeUpstream(t, minimalUpstreamHandler)
	_, signer := newAuditSigner(t)

	detector := &stubProcessDetector{
		id: processdetect.DetectedIdentity{AgentName: "cursor"},
	}
	rl := &stubRateLimiter{}

	proxyAddr, _, stop := startProxyWithDetect(t, upstream.dial, nil, signer, detector, rl)
	defer stop()

	conn, fe := dialClientWithApp(t, proxyAddr, "")
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT bucket"})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush query: %v", err)
	}
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}
	_ = conn.Close()

	if len(rl.calls) == 0 {
		t.Fatal("rate limiter never invoked")
	}
	// Find the Query frame call (simple_query route).
	for _, c := range rl.calls {
		if c.route == "simple_query" {
			if c.agentID != "inferred:cursor" {
				t.Errorf("agentID for simple_query = %q, want \"inferred:cursor\"", c.agentID)
			}
			return
		}
	}
	t.Errorf("no simple_query call recorded; got %+v", rl.calls)
}

// TestInferredIdentityHumanBucketsAsHuman verifies the "human:" prefix
// case: an inferred identity with agentName="human" gets bucket key
// "human:human", which the ratelimit.Limiter routes to the
// production pool. We exercise the wiring via the stub, asserting
// the prefix only — the pool-routing assertion lives in
// ratelimit_test.go's TestHumanBucketsRouteToProductionPool.
func TestInferredIdentityHumanBucketsAsHuman(t *testing.T) {
	t.Parallel()
	upstream := newFakeUpstream(t, minimalUpstreamHandler)
	_, signer := newAuditSigner(t)

	detector := &stubProcessDetector{
		id: processdetect.DetectedIdentity{AgentName: "human"},
	}
	rl := &stubRateLimiter{}

	proxyAddr, _, stop := startProxyWithDetect(t, upstream.dial, nil, signer, detector, rl)
	defer stop()

	conn, fe := dialClientWithApp(t, proxyAddr, "")
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT 1"})
	_ = fe.Flush()
	_ = waitForReadyForQuery(t, fe)
	_ = conn.Close()

	for _, c := range rl.calls {
		if c.route == "simple_query" {
			if c.agentID != "human:human" {
				t.Errorf("human bucket key = %q, want \"human:human\"", c.agentID)
			}
			return
		}
	}
	t.Errorf("no simple_query call recorded")
}

// TestInferredIdentityDoesNotEnableCoalescing exercises the brief's
// explicit acceptance: an inferred connection sending two identical
// SELECT queries must NOT have the second served from the per-agent
// coalescing cache, because inferred identities can't be safely
// shared across the (potentially different) RLS contexts the same
// agent name can attach to. We assert by counting the upstream
// frames received — both queries must reach the fake upstream.
func TestInferredIdentityDoesNotEnableCoalescing(t *testing.T) {
	t.Parallel()
	upstreamQueryCount := 0
	upstream := newFakeUpstream(t, func(t *testing.T, be *pgproto3.Backend, _ net.Conn) {
		if _, err := be.ReceiveStartupMessage(); err != nil {
			return
		}
		be.Send(&pgproto3.AuthenticationOk{})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		if err := be.Flush(); err != nil {
			return
		}
		for {
			msg, err := be.Receive()
			if err != nil {
				return
			}
			if _, ok := msg.(*pgproto3.Query); ok {
				upstreamQueryCount++
				be.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 1")})
				be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
				_ = be.Flush()
			}
			if _, ok := msg.(*pgproto3.Terminate); ok {
				return
			}
		}
	})
	_, signer := newAuditSigner(t)

	detector := &stubProcessDetector{
		id: processdetect.DetectedIdentity{AgentName: "cursor"},
	}

	// We need a real-shaped Coalescer to drive the path: a stub that
	// would always serve cache hits would defeat the test. Use a
	// minimal in-memory implementation that mimics coalesce.New
	// without the package dependency.
	cache := &miniCoalescer{store: map[string][]byte{}}

	dbPath := filepath.Join(t.TempDir(), "audit.db")
	w, err := audit.Open(dbPath, signer)
	if err != nil {
		t.Fatalf("open audit: %v", err)
	}
	defer w.Close()

	srv := &Server{
		ListenAddr:       "127.0.0.1:0",
		UpstreamAddr:     "127.0.0.1:0",
		Logger:           silentLogger{},
		DialUpstream:     upstream.dial,
		AuditWriter:      w,
		ProcessDetector:  detector,
		Coalescer:        cache,
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		go func() {
			deadline := time.Now().Add(2 * time.Second)
			for time.Now().Before(deadline) {
				if srv.Addr() != nil {
					close(ready)
					return
				}
				time.Sleep(5 * time.Millisecond)
			}
			close(ready)
		}()
		_ = srv.ListenAndServe(ctx)
	}()
	<-ready

	proxyAddr := srv.Addr().String()

	conn, fe := dialClientWithApp(t, proxyAddr, "")
	if err := waitForReadyForQuery(t, fe); err != nil {
		t.Fatalf("wait ready: %v", err)
	}

	// Send the SAME SELECT twice. If coalescing were active for
	// inferred identities, the second would be served from cache
	// and upstreamQueryCount would stay at 1. We require it to hit
	// 2.
	for i := 0; i < 2; i++ {
		fe.Send(&pgproto3.Query{String: "SELECT same"})
		if err := fe.Flush(); err != nil {
			t.Fatalf("flush %d: %v", i, err)
		}
		if err := waitForReadyForQuery(t, fe); err != nil {
			t.Fatalf("wait %d: %v", i, err)
		}
	}
	_ = conn.Close()

	// Give the proxy a moment to settle the second response.
	time.Sleep(50 * time.Millisecond)
	if upstreamQueryCount != 2 {
		t.Errorf("upstream received %d Query frames; want 2 (no coalescing for inferred)", upstreamQueryCount)
	}

	// Also: the cache should never have been called Lookup with a
	// non-empty agentID (because state.agentID stays "" for
	// inferred identities). miniCoalescer records every Lookup
	// agentID; assert.
	for _, agentID := range cache.lookupCallsAgentIDs {
		if agentID != "" {
			t.Errorf("Coalescer.Lookup called with non-empty agentID %q for inferred identity", agentID)
		}
	}
}

// =============================================================================
// Helpers
// =============================================================================

func newAuditSigner(t *testing.T) (*identity.Issuer, audit.Signer) {
	t.Helper()
	iss, err := identity.NewIssuer()
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	return iss, &auditSignerWrap{iss: iss}
}

// auditSignerWrap adapts *identity.Issuer to audit.Signer.
type auditSignerWrap struct {
	iss *identity.Issuer
}

func (a *auditSignerWrap) SignRaw(payload []byte) []byte {
	return a.iss.SignRaw(payload)
}

// queryFirstQueryAudit reads the first Query-direction audit row and
// returns (agent_source, agent_name, agent_id-nullable).
func queryFirstQueryAudit(t *testing.T, dbPath string) (source, name string, id sql.NullString) {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	defer db.Close()

	row := db.QueryRow(
		`SELECT agent_source, COALESCE(agent_name, ''), agent_id FROM audit WHERE msg_type='Query' ORDER BY id LIMIT 1`,
	)
	if err := row.Scan(&source, &name, &id); err != nil {
		t.Fatalf("scan audit row: %v", err)
	}
	return source, name, id
}

// waitForReadyForQuery drains pgproto3 messages from fe until either
// a ReadyForQuery arrives or 2s elapse. Used to synchronize the
// test goroutine with the proxy's startup-complete signal.
func waitForReadyForQuery(t *testing.T, fe *pgproto3.Frontend) error {
	t.Helper()
	done := make(chan error, 1)
	go func() {
		for {
			msg, err := fe.Receive()
			if err != nil {
				done <- err
				return
			}
			if _, ok := msg.(*pgproto3.ReadyForQuery); ok {
				done <- nil
				return
			}
		}
	}()
	select {
	case err := <-done:
		return err
	case <-time.After(2 * time.Second):
		return errors.New("timeout waiting for ReadyForQuery")
	}
}

// miniCoalescer is a minimal Coalescer for the no-coalesce-on-inferred
// test. Records every Lookup call's agentID so the test can verify
// pgproxy never even consulted the cache with an empty agent_id
// (which would be the precondition for accidental coalescing of
// inferred traffic).
type miniCoalescer struct {
	store               map[string][]byte
	lookupCallsAgentIDs []string
}

func (m *miniCoalescer) Lookup(agentID string, key CacheKey) ([]byte, bool) {
	m.lookupCallsAgentIDs = append(m.lookupCallsAgentIDs, agentID)
	v, ok := m.store[agentID+"|"+key.QueryText]
	return v, ok
}

func (m *miniCoalescer) Store(agentID string, key CacheKey, response []byte) {
	m.store[agentID+"|"+key.QueryText] = response
}
