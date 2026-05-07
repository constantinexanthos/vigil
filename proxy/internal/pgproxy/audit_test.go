package pgproxy

import (
	"context"
	"database/sql"
	"net"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"
	_ "modernc.org/sqlite"

	"github.com/costaxanthos/vigil/proxy/internal/audit"
	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

// startProxyWithAudit boots a pgproxy.Server that audits to a fresh
// SQLite DB and (if verifier!=nil) verifies application_name tokens.
// Returns proxy address, db path, and a cleanup.
func startProxyWithAudit(
	t *testing.T,
	dial func(ctx context.Context) (net.Conn, error),
	verifier Verifier,
	signer audit.Signer,
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

// dialClientWithApp opens a TCP client connection to the proxy, sends a
// startup message with the supplied application_name, and returns the
// raw conn + Frontend. The fake upstream is expected to ack with
// AuthenticationOk + ReadyForQuery.
func dialClientWithApp(t *testing.T, proxyAddr, appName string) (net.Conn, *pgproto3.Frontend) {
	t.Helper()
	conn, err := net.Dial("tcp", proxyAddr)
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	fe := pgproto3.NewFrontend(conn, conn)
	params := map[string]string{
		"database": "mydb",
		"user":     "alice",
	}
	if appName != "" {
		params["application_name"] = appName
	}
	fe.Send(&pgproto3.StartupMessage{
		ProtocolVersion: pgproto3.ProtocolVersionNumber,
		Parameters:      params,
	})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush startup: %v", err)
	}
	return conn, fe
}

// =============================================================================
// Test: identity attached via application_name=vigil:<valid-token>.
// =============================================================================
func TestIdentityAttached(t *testing.T) {
	t.Parallel()
	iss, err := identity.NewIssuer()
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	id, tok, err := iss.Issue(identity.IssueRequest{
		AgentName: "claude-code",
		Principal: "alice@example.com",
		Scopes:    []string{"read"},
	})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	upstream := newFakeUpstream(t, queryEchoHandler())
	proxyAddr, dbPath, stop := startProxyWithAudit(t, upstream.dial, iss, iss)
	defer stop()

	_, fe := dialClientWithApp(t, proxyAddr, "vigil:"+tok.Token)

	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain to ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT 1"})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush query: %v", err)
	}
	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain after query: %v", err)
	}

	// Give the audit writer a beat to flush. Audit writes are
	// synchronous in the pump goroutine but the network read+write
	// happens before the audit Write — we just need the pump to have
	// processed the frame.
	waitForAuditCount(t, dbPath, 2 /* startup-ish + Query (client) */, 2*time.Second)

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	defer db.Close()

	rows, err := db.Query(`SELECT agent_id, agent_name, msg_type, query_text FROM audit WHERE direction='client' ORDER BY id`)
	if err != nil {
		t.Fatalf("query audit: %v", err)
	}
	defer rows.Close()

	var sawQuery bool
	for rows.Next() {
		var agentID, agentName, msgType sql.NullString
		var queryText sql.NullString
		if err := rows.Scan(&agentID, &agentName, &msgType, &queryText); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if !agentID.Valid || agentID.String != id.ID {
			t.Errorf("agent_id = %v, want %q", agentID, id.ID)
		}
		if !agentName.Valid || agentName.String != "claude-code" {
			t.Errorf("agent_name = %v, want %q", agentName, "claude-code")
		}
		if msgType.String == "Query" {
			sawQuery = true
			if !queryText.Valid || queryText.String != "SELECT 1" {
				t.Errorf("query_text = %v, want %q", queryText, "SELECT 1")
			}
		}
	}
	if !sawQuery {
		t.Errorf("expected at least one Query audit row with query_text='SELECT 1'")
	}
}

// =============================================================================
// Test: identity rejection is non-fatal — invalid token proxies normally.
// =============================================================================
func TestInvalidIdentityIsNonFatal(t *testing.T) {
	t.Parallel()
	iss, err := identity.NewIssuer()
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	upstream := newFakeUpstream(t, queryEchoHandler())
	proxyAddr, dbPath, stop := startProxyWithAudit(t, upstream.dial, iss, iss)
	defer stop()

	_, fe := dialClientWithApp(t, proxyAddr, "vigil:bogus.invalidtoken")

	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain to ready: %v", err)
	}
	fe.Send(&pgproto3.Query{String: "SELECT 2"})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush: %v", err)
	}
	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain after query: %v", err)
	}

	waitForAuditCount(t, dbPath, 1, 2*time.Second)

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	defer db.Close()
	row := db.QueryRow(`SELECT agent_id FROM audit WHERE direction='client' AND msg_type='Query' LIMIT 1`)
	var agentID sql.NullString
	if err := row.Scan(&agentID); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if agentID.Valid {
		t.Errorf("agent_id = %q, want NULL (verification failed)", agentID.String)
	}
}

// =============================================================================
// Test: 1000 sequential SELECT 1 queries → 1000 client-side Query audit
// rows, each with a valid Ed25519 signature.
// =============================================================================
func TestThousandQueryAuditSigning(t *testing.T) {
	t.Parallel()
	iss, err := identity.NewIssuer()
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	id, tok, err := iss.Issue(identity.IssueRequest{
		AgentName: "test-agent",
		Principal: "tester@example.com",
		Scopes:    []string{"read"},
	})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	upstream := newFakeUpstream(t, queryEchoHandler())
	proxyAddr, dbPath, stop := startProxyWithAudit(t, upstream.dial, iss, iss)
	defer stop()

	_, fe := dialClientWithApp(t, proxyAddr, "vigil:"+tok.Token)
	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain to ready: %v", err)
	}

	const N = 1000
	const queryString = "SELECT 1"
	for i := 0; i < N; i++ {
		fe.Send(&pgproto3.Query{String: queryString})
		if err := fe.Flush(); err != nil {
			t.Fatalf("flush: %v", err)
		}
		if err := drainUntilReady(fe); err != nil {
			t.Fatalf("drain after query %d: %v", i, err)
		}
	}

	// Wait for the 1000 client-side Query rows to land.
	waitForCondition(t, 5*time.Second, func() bool {
		db, err := sql.Open("sqlite", dbPath)
		if err != nil {
			return false
		}
		defer db.Close()
		row := db.QueryRow(`SELECT count(*) FROM audit WHERE direction='client' AND msg_type='Query'`)
		var c int
		if err := row.Scan(&c); err != nil {
			return false
		}
		return c >= N
	}, "1000 Query audit rows")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	defer db.Close()
	rows, err := db.Query(`
		SELECT ts, agent_id, conn_id, msg_type, query_text, sig
		FROM audit
		WHERE direction='client' AND msg_type='Query'
		ORDER BY id
	`)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()

	pub := iss.PublicKey()
	verified := 0
	for rows.Next() {
		var ts, agentID, connID, msgType, queryText, sig string
		if err := rows.Scan(&ts, &agentID, &connID, &msgType, &queryText, &sig); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if agentID != id.ID {
			t.Fatalf("agent_id = %q, want %q", agentID, id.ID)
		}
		if queryText != queryString {
			t.Fatalf("query_text = %q, want %q", queryText, queryString)
		}
		if err := audit.Verify(pub, sig, agentID, connID, ts, msgType, queryText); err != nil {
			t.Fatalf("verify row: %v", err)
		}
		verified++
	}
	if verified != N {
		t.Errorf("verified %d rows, want %d", verified, N)
	}
}

// =============================================================================
// Test: SCRAM-SHA-256 auth flows correctly through the message pump.
//
// We don't run a real SCRAM server — that's the smoke test's job. Here we
// drive a synthetic SCRAM-shaped exchange to lock in the bytes-equivalent
// forwarding + authType bookkeeping, since this is the regression that
// drove `1885b76` to fall back to io.Copy.
// =============================================================================
func TestSCRAMBytesAreForwardedTransparently(t *testing.T) {
	t.Parallel()
	// SCRAM payloads from the client side. We pick fixed bytes so the
	// upstream side can assert byte-equivalence without parsing SCRAM
	// itself. Real psql sends similar 'p' frames during SASL.
	clientFirst := []byte("n,,n=alice,r=fyko+d2lbbFgONRv9qkxdawL")  // SASLInitialResponse 'p'
	clientFinal := []byte("c=biws,r=fyko+d2lbbFgONRv9qkxdawL...,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=")

	clientFirstReceived := make(chan []byte, 1)
	clientFinalReceived := make(chan []byte, 1)
	doneSCRAM := make(chan struct{})

	upstream := newFakeUpstream(t, func(t *testing.T, be *pgproto3.Backend, conn net.Conn) {
		_, err := be.ReceiveStartupMessage()
		if err != nil {
			t.Errorf("upstream receive startup: %v", err)
			return
		}
		// Send AuthenticationSASL — this is the trigger that has bitten
		// the proxy before. The proxy MUST see this on the upstream side
		// and update its authType state before it forwards the next
		// client 'p' message — otherwise it would mis-decode it.
		be.Send(&pgproto3.AuthenticationSASL{AuthMechanisms: []string{"SCRAM-SHA-256"}})
		if err := be.Flush(); err != nil {
			t.Errorf("upstream flush sasl: %v", err)
			return
		}
		// Expect a 'p' (SASLInitialResponse) — but pgproto3.Backend's
		// 'p' decoder will dispatch using its own authType flyweight.
		// Tell it the auth context so .Receive() decodes correctly.
		_ = be.SetAuthType(pgproto3.AuthTypeSASL)
		msg, err := be.Receive()
		if err != nil {
			t.Errorf("upstream receive saslinitial: %v", err)
			return
		}
		sir, ok := msg.(*pgproto3.SASLInitialResponse)
		if !ok {
			t.Errorf("upstream expected SASLInitialResponse, got %T", msg)
			return
		}
		clientFirstReceived <- sir.Data

		// Send AuthenticationSASLContinue — server-first message.
		be.Send(&pgproto3.AuthenticationSASLContinue{Data: []byte("r=server-nonce,s=salt,i=4096")})
		if err := be.Flush(); err != nil {
			t.Errorf("upstream flush sasl-continue: %v", err)
			return
		}
		_ = be.SetAuthType(pgproto3.AuthTypeSASLContinue)
		msg, err = be.Receive()
		if err != nil {
			t.Errorf("upstream receive saslfinal: %v", err)
			return
		}
		sr, ok := msg.(*pgproto3.SASLResponse)
		if !ok {
			t.Errorf("upstream expected SASLResponse, got %T", msg)
			return
		}
		clientFinalReceived <- sr.Data

		// Finish auth.
		be.Send(&pgproto3.AuthenticationSASLFinal{Data: []byte("v=server-signature")})
		_ = be.SetAuthType(pgproto3.AuthTypeSASLFinal)
		be.Send(&pgproto3.AuthenticationOk{})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		_ = be.Flush()
		close(doneSCRAM)

		// Sit idle so the test can close cleanly.
		_, _ = be.Receive()
	})

	iss, err := identity.NewIssuer()
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	proxyAddr, dbPath, stop := startProxyWithAudit(t, upstream.dial, iss, iss)
	defer stop()

	conn, fe := dialClientWithApp(t, proxyAddr, "")

	// Read AuthenticationSASL.
	msg, err := fe.Receive()
	if err != nil {
		t.Fatalf("client receive sasl: %v", err)
	}
	if _, ok := msg.(*pgproto3.AuthenticationSASL); !ok {
		t.Fatalf("client expected AuthenticationSASL, got %T", msg)
	}

	// Send SASLInitialResponse.
	fe.Send(&pgproto3.SASLInitialResponse{
		AuthMechanism: "SCRAM-SHA-256",
		Data:          clientFirst,
	})
	if err := fe.Flush(); err != nil {
		t.Fatalf("client flush sasl-initial: %v", err)
	}
	select {
	case got := <-clientFirstReceived:
		if string(got) != string(clientFirst) {
			t.Errorf("upstream got SASLInitialResponse data %q, want %q", got, clientFirst)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("upstream never received SASLInitialResponse")
	}

	// Read AuthenticationSASLContinue.
	msg, err = fe.Receive()
	if err != nil {
		t.Fatalf("client receive sasl-continue: %v", err)
	}
	if _, ok := msg.(*pgproto3.AuthenticationSASLContinue); !ok {
		t.Fatalf("client expected AuthenticationSASLContinue, got %T", msg)
	}

	// Send SASLResponse (final). Note: in real SCRAM this carries the
	// client-final-message; here we just want byte-equivalence.
	fe.Send(&pgproto3.SASLResponse{Data: clientFinal})
	if err := fe.Flush(); err != nil {
		t.Fatalf("client flush sasl-final: %v", err)
	}
	select {
	case got := <-clientFinalReceived:
		if string(got) != string(clientFinal) {
			t.Errorf("upstream got SASLResponse data %q, want %q", got, clientFinal)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("upstream never received SASLResponse")
	}

	// Finish: drain to ReadyForQuery.
	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain to ready: %v", err)
	}

	select {
	case <-doneSCRAM:
		// good — full SCRAM exchange survived the pump.
	case <-time.After(3 * time.Second):
		t.Fatal("scram never completed")
	}
	_ = conn.Close()

	// Audit must have captured the SASL-step messages with the
	// disambiguated names. Specifically, the *client*-side SASL frames
	// should be classified as SASLInitialResponse / SASLResponse rather
	// than the generic PasswordMessage.
	waitForCondition(t, 2*time.Second, func() bool {
		db, err := sql.Open("sqlite", dbPath)
		if err != nil {
			return false
		}
		defer db.Close()
		row := db.QueryRow(`SELECT count(*) FROM audit WHERE direction='client' AND msg_type IN ('SASLInitialResponse','SASLResponse')`)
		var c int
		if err := row.Scan(&c); err != nil {
			return false
		}
		return c >= 2
	}, "SASL audit rows present")
}

// queryEchoHandler returns a fakeUpstream handler that completes
// AuthenticationOk / ReadyForQuery and then echoes a ReadyForQuery for
// every Query the client sends, looping forever until EOF.
func queryEchoHandler() func(t *testing.T, be *pgproto3.Backend, conn net.Conn) {
	return func(t *testing.T, be *pgproto3.Backend, conn net.Conn) {
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
				if err := be.Flush(); err != nil {
					return
				}
			}
			if _, ok := msg.(*pgproto3.Terminate); ok {
				return
			}
		}
	}
}

// waitForAuditCount blocks until at least n audit rows exist or the
// deadline elapses.
func waitForAuditCount(t *testing.T, dbPath string, n int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		db, err := sql.Open("sqlite", dbPath)
		if err == nil {
			row := db.QueryRow(`SELECT count(*) FROM audit`)
			var c int
			if err := row.Scan(&c); err == nil && c >= n {
				_ = db.Close()
				return
			}
			_ = db.Close()
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("audit count never reached %d", n)
}

// waitForCondition blocks until cond() returns true or the deadline elapses.
func waitForCondition(t *testing.T, timeout time.Duration, cond func() bool, label string) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("condition never met: %s", label)
}

// silence the unused-import warning when the file is built without
// the audit-test variants (sync is imported by some path nuances).
var _ = sync.Mutex{}
