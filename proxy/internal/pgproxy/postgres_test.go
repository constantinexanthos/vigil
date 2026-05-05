package pgproxy

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"
)

// silentLogger discards log output during tests so a `go test -v` run
// stays readable.
type silentLogger struct{}

func (silentLogger) Printf(string, ...any) {}

// startProxy boots a pgproxy.Server on a 127.0.0.1:0 port, with the
// supplied DialUpstream override. Returns the proxy address and a cleanup.
func startProxy(t *testing.T, dial func(ctx context.Context) (net.Conn, error)) (proxyAddr string, cleanup func()) {
	t.Helper()
	srv := &Server{
		ListenAddr:   "127.0.0.1:0",
		UpstreamAddr: "127.0.0.1:0", // unused when DialUpstream is set
		Logger:       silentLogger{},
		DialUpstream: dial,
	}
	ctx, cancel := context.WithCancel(context.Background())

	ready := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		// Briefly poll Addr() so the test can read it once Listen
		// has bound. ListenAndServe binds before its Accept loop, so
		// this returns quickly.
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
			close(ready) // give up; test will fail on dial
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
	}
	return proxyAddr, cleanup
}

// fakeUpstream is a controllable in-process Postgres-like server. Tests
// supply a handler that runs against a pgproto3.Backend bound to the
// upstream side of the proxy hop.
type fakeUpstream struct {
	t       *testing.T
	listen  net.Listener
	handler func(t *testing.T, backend *pgproto3.Backend, conn net.Conn)
	connsMu sync.Mutex
	conns   []net.Conn
}

func newFakeUpstream(t *testing.T, handler func(t *testing.T, backend *pgproto3.Backend, conn net.Conn)) *fakeUpstream {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("fake upstream listen: %v", err)
	}
	u := &fakeUpstream{t: t, listen: ln, handler: handler}
	go u.acceptLoop()
	t.Cleanup(u.close)
	return u
}

func (u *fakeUpstream) acceptLoop() {
	for {
		c, err := u.listen.Accept()
		if err != nil {
			return
		}
		u.connsMu.Lock()
		u.conns = append(u.conns, c)
		u.connsMu.Unlock()
		go func(conn net.Conn) {
			defer conn.Close()
			be := pgproto3.NewBackend(conn, conn)
			u.handler(u.t, be, conn)
		}(c)
	}
}

func (u *fakeUpstream) addr() string { return u.listen.Addr().String() }

func (u *fakeUpstream) dial(ctx context.Context) (net.Conn, error) {
	d := net.Dialer{Timeout: 2 * time.Second}
	return d.DialContext(ctx, "tcp", u.addr())
}

func (u *fakeUpstream) close() {
	_ = u.listen.Close()
	u.connsMu.Lock()
	defer u.connsMu.Unlock()
	for _, c := range u.conns {
		_ = c.Close()
	}
}

// dialClient opens a TCP client connection to the proxy and returns a
// pgproto3.Frontend bound to it (Frontend = client→server perspective).
func dialClient(t *testing.T, proxyAddr string) (net.Conn, *pgproto3.Frontend) {
	t.Helper()
	conn, err := net.Dial("tcp", proxyAddr)
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	fe := pgproto3.NewFrontend(conn, conn)
	return conn, fe
}

// helper: send a startup message with given db/user.
func sendStartup(t *testing.T, fe *pgproto3.Frontend, db, user string) {
	t.Helper()
	fe.Send(&pgproto3.StartupMessage{
		ProtocolVersion: pgproto3.ProtocolVersionNumber,
		Parameters: map[string]string{
			"database": db,
			"user":     user,
		},
	})
	if err := fe.Flush(); err != nil {
		t.Fatalf("flush startup: %v", err)
	}
}

// =============================================================================
// Test 1 — accept connection, relay messages both directions.
// =============================================================================
//
// The fake upstream completes startup with ReadyForQuery, then on receiving
// a Query message replies with a CommandComplete. We assert the client sees
// both ReadyForQuery (initial) and CommandComplete (after sending Query).
func TestRelaysMessagesBothDirections(t *testing.T) {
	t.Parallel()
	queryReceived := make(chan string, 1)
	upstream := newFakeUpstream(t, func(t *testing.T, be *pgproto3.Backend, _ net.Conn) {
		// Receive startup, ack with ReadyForQuery.
		_, err := be.ReceiveStartupMessage()
		if err != nil {
			t.Errorf("upstream: receive startup: %v", err)
			return
		}
		be.Send(&pgproto3.AuthenticationOk{})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		if err := be.Flush(); err != nil {
			t.Errorf("upstream: flush ready: %v", err)
			return
		}
		// Wait for a Query, echo CommandComplete.
		msg, err := be.Receive()
		if err != nil {
			t.Errorf("upstream: receive query: %v", err)
			return
		}
		q, ok := msg.(*pgproto3.Query)
		if !ok {
			t.Errorf("upstream: expected Query, got %T", msg)
			return
		}
		queryReceived <- q.String
		be.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 1")})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		_ = be.Flush()
	})

	proxyAddr, stop := startProxy(t, upstream.dial)
	defer stop()

	clientConn, fe := dialClient(t, proxyAddr)
	sendStartup(t, fe, "mydb", "postgres")

	// Read until ReadyForQuery.
	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("client: drain to ready: %v", err)
	}

	// Send a Query; verify upstream observes it and we get
	// CommandComplete back.
	const sql = "SELECT 1"
	fe.Send(&pgproto3.Query{String: sql})
	if err := fe.Flush(); err != nil {
		t.Fatalf("client: flush query: %v", err)
	}
	select {
	case got := <-queryReceived:
		if got != sql {
			t.Errorf("upstream got %q, want %q", got, sql)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("upstream never received Query")
	}

	// Drain back response: CommandComplete then ReadyForQuery.
	gotCmdComplete := false
	for {
		msg, err := fe.Receive()
		if err != nil {
			t.Fatalf("client: receive after query: %v", err)
		}
		if cc, ok := msg.(*pgproto3.CommandComplete); ok {
			if string(cc.CommandTag) != "SELECT 1" {
				t.Errorf("got CommandTag %q, want %q", cc.CommandTag, "SELECT 1")
			}
			gotCmdComplete = true
		}
		if _, ok := msg.(*pgproto3.ReadyForQuery); ok {
			break
		}
	}
	if !gotCmdComplete {
		t.Error("client never saw CommandComplete")
	}
	_ = clientConn.Close()
}

// drainUntilReady reads frontend (server-bound) responses until ReadyForQuery
// or error.
func drainUntilReady(fe *pgproto3.Frontend) error {
	for {
		msg, err := fe.Receive()
		if err != nil {
			return err
		}
		if _, ok := msg.(*pgproto3.ReadyForQuery); ok {
			return nil
		}
	}
}

// =============================================================================
// Test 2 — SSLRequest is declined with 'N'.
// =============================================================================
func TestDeclinesSSLRequest(t *testing.T) {
	t.Parallel()
	upstreamHit := make(chan struct{}, 1)
	upstream := newFakeUpstream(t, func(t *testing.T, be *pgproto3.Backend, _ net.Conn) {
		// Receive startup; that confirms TLS was declined and the client
		// fell through to a regular StartupMessage which we forwarded.
		_, err := be.ReceiveStartupMessage()
		if err != nil {
			t.Errorf("upstream startup after SSL decline: %v", err)
			return
		}
		upstreamHit <- struct{}{}
		be.Send(&pgproto3.AuthenticationOk{})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		_ = be.Flush()
	})

	proxyAddr, stop := startProxy(t, upstream.dial)
	defer stop()

	conn, err := net.Dial("tcp", proxyAddr)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	// Manually send an SSLRequest body — pgproto3 doesn't expose Send()
	// on the frontend for SSLRequest the same way it does for
	// StartupMessage, so we encode the 8-byte SSLRequest directly:
	//   length (4) + magic (1234,5679) → packed big-endian.
	sslReq := []byte{0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f}
	if _, err := conn.Write(sslReq); err != nil {
		t.Fatalf("write SSLRequest: %v", err)
	}

	// Expect a single 'N' byte back (decline).
	resp := make([]byte, 1)
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := io.ReadFull(conn, resp); err != nil {
		t.Fatalf("read SSL decline byte: %v", err)
	}
	if resp[0] != 'N' {
		t.Errorf("got SSL response %q, want 'N'", resp[0])
	}
	_ = conn.SetReadDeadline(time.Time{})

	// Now follow up with a regular StartupMessage. Both real psql and any
	// libpq-based client behave this way: SSLRequest first, on decline
	// fall back to StartupMessage.
	fe := pgproto3.NewFrontend(conn, conn)
	sendStartup(t, fe, "mydb", "postgres")

	select {
	case <-upstreamHit:
		// good — startup forwarded after SSL decline.
	case <-time.After(2 * time.Second):
		t.Fatal("upstream never received post-SSL startup")
	}
}

// =============================================================================
// Test 3 — startup parameters reach upstream untouched.
// =============================================================================
func TestStartupParametersForwarded(t *testing.T) {
	t.Parallel()
	gotParams := make(chan map[string]string, 1)
	upstream := newFakeUpstream(t, func(t *testing.T, be *pgproto3.Backend, _ net.Conn) {
		msg, err := be.ReceiveStartupMessage()
		if err != nil {
			t.Errorf("upstream receive startup: %v", err)
			return
		}
		sm, ok := msg.(*pgproto3.StartupMessage)
		if !ok {
			t.Errorf("upstream got non-startup: %T", msg)
			return
		}
		// Copy params so the channel send doesn't race with map reuse.
		copied := make(map[string]string, len(sm.Parameters))
		for k, v := range sm.Parameters {
			copied[k] = v
		}
		gotParams <- copied
		be.Send(&pgproto3.AuthenticationOk{})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		_ = be.Flush()
	})

	proxyAddr, stop := startProxy(t, upstream.dial)
	defer stop()

	_, fe := dialClient(t, proxyAddr)
	sendStartup(t, fe, "mydb", "alice")

	select {
	case p := <-gotParams:
		if p["database"] != "mydb" {
			t.Errorf("upstream database = %q, want %q", p["database"], "mydb")
		}
		if p["user"] != "alice" {
			t.Errorf("upstream user = %q, want %q", p["user"], "alice")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("upstream never received startup params")
	}
}

// =============================================================================
// Test 4 — upstream unreachable returns FATAL ErrorResponse.
// =============================================================================
func TestUpstreamUnreachable(t *testing.T) {
	t.Parallel()
	dial := func(ctx context.Context) (net.Conn, error) {
		return nil, errors.New("upstream offline")
	}
	proxyAddr, stop := startProxy(t, dial)
	defer stop()

	conn, fe := dialClient(t, proxyAddr)
	defer conn.Close()
	sendStartup(t, fe, "mydb", "postgres")

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		msg, err := fe.Receive()
		if err != nil {
			t.Fatalf("client receive: %v", err)
		}
		errResp, ok := msg.(*pgproto3.ErrorResponse)
		if !ok {
			continue
		}
		if errResp.Severity != "FATAL" {
			t.Errorf("severity = %q, want FATAL", errResp.Severity)
		}
		if errResp.Code != "08006" {
			t.Errorf("code = %q, want 08006", errResp.Code)
		}
		if !strings.Contains(errResp.Message, "vigil:") {
			t.Errorf("message = %q, expected 'vigil:' prefix", errResp.Message)
		}
		return
	}
}

// =============================================================================
// Test 5 — client mid-stream disconnect closes upstream connection.
// =============================================================================
func TestClientDisconnectClosesUpstream(t *testing.T) {
	t.Parallel()
	var upstreamConn atomic.Value     // *net.Conn
	upstreamGoroutineDone := make(chan struct{})
	upstream := newFakeUpstream(t, func(t *testing.T, be *pgproto3.Backend, conn net.Conn) {
		defer close(upstreamGoroutineDone)
		upstreamConn.Store(&conn)
		_, err := be.ReceiveStartupMessage()
		if err != nil {
			return
		}
		be.Send(&pgproto3.AuthenticationOk{})
		be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		_ = be.Flush()
		// Block on receive forever; the client will close mid-stream
		// and we should see EOF here.
		for {
			_, err := be.Receive()
			if err != nil {
				return
			}
		}
	})

	proxyAddr, stop := startProxy(t, upstream.dial)
	defer stop()

	conn, fe := dialClient(t, proxyAddr)
	sendStartup(t, fe, "mydb", "postgres")
	if err := drainUntilReady(fe); err != nil {
		t.Fatalf("drain to ready: %v", err)
	}

	// Send a Query, then immediately close — the proxy must still cancel
	// the upstream goroutine.
	fe.Send(&pgproto3.Query{String: "SELECT pg_sleep(60)"})
	_ = fe.Flush()
	_ = conn.Close()

	select {
	case <-upstreamGoroutineDone:
		// good — upstream connection EOF'd within the timeout.
	case <-time.After(3 * time.Second):
		t.Fatal("upstream goroutine never observed client close")
	}
}

// =============================================================================
// Backstop: make sure the package logger interface accepts *log.Logger.
// =============================================================================
func TestStdLibLoggerSatisfiesInterface(t *testing.T) {
	var _ Logger = log.Default()
	_ = fmt.Sprintf // keep fmt import for tests that may use it
}
