// Package pgproxy implements a transparent Postgres wire-protocol proxy.
//
// v0.1.0b milestone: single-goroutine message pump. The startup phase
// is parsed in-band (SSL/GSS decline, StartupMessage parameter scanning
// for application_name=vigil:<token>), then the post-startup relay runs
// as a select() over both directions in one goroutine. Every Postgres
// frame is parsed, written to the audit table with a signed canonical
// row, and forwarded byte-for-byte to the other side.
//
// Why a single goroutine and not the previous io.Copy pumps? Because
// the wire format of a 'p' message (PasswordMessage / SASLInitialResponse
// / SASLResponse / GSSResponse) is context-dependent on the most recent
// upstream Authentication* message. In a two-goroutine relay the auth-
// type signal lives on the upstream→client goroutine and the consumer
// of 'p' lives on the client→upstream goroutine, so propagating the
// signal without a race requires per-message synchronization. A single
// goroutine sees both sides in sequence, so SCRAM tracks correctly.
//
// We deliberately do *not* re-encode messages by round-tripping through
// pgproto3.Encode — even minor differences (preserved-but-different
// padding, parameter ordering, copy_data chunking) would break the
// "psql works identically" regression bar. Instead we read the raw
// frame bytes (1-byte type + 4-byte length + body) and forward them as
// a single Write to the other side. pgproto3 is used only to *interpret*
// frames we want to audit, not to serialize them back onto the wire.
package pgproxy

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"

	"github.com/costaxanthos/vigil/proxy/internal/audit"
	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

// Postgres wire request codes used in the startup phase. ProtocolVersion30
// is the standard v3.0 startup version; the other three are the well-known
// magic numbers that tell us "this is not a regular startup". Defined here
// because pgproto3 keeps the equivalents private.
const (
	protocolVersion30 = 196608   // 0x00030000 — protocol 3.0
	sslRequestCode    = 80877103 // 0x04d2162f
	gssEncReqCode     = 80877104 // 0x04d21630
	cancelRequestCode = 80877102 // 0x04d2162e
	maxStartupLen     = 10000    // matches PG's MAX_STARTUP_PACKET_LENGTH
)

// Postgres authentication subtype codes from src/include/libpq/pqcomm.h.
// Mirrored here so we don't pull a dependency just for these constants.
const (
	authTypeOk                = 0
	authTypeCleartextPassword = 3
	authTypeMD5Password       = 5
	authTypeGSS               = 7
	authTypeGSSCont           = 8
	authTypeSASL              = 10
	authTypeSASLContinue      = 11
	authTypeSASLFinal         = 12
)

// Logger is the minimal logger interface pgproxy needs. The standard
// library *log.Logger satisfies it; a no-op implementation is also fine.
type Logger interface {
	Printf(format string, args ...any)
}

// Verifier is the subset of *identity.Issuer that pgproxy needs to
// resolve application_name=vigil:<token> at startup. Production wires
// in a real *identity.Issuer; tests can substitute a stub.
type Verifier interface {
	Verify(rawToken string) (identity.Identity, error)
}

// Server is a transparent Postgres proxy. It accepts client connections on
// ListenAddr, dials UpstreamAddr per accepted connection, and runs a
// single-goroutine message pump that audits and forwards every frame.
type Server struct {
	ListenAddr   string
	UpstreamAddr string
	Logger       Logger

	// AuditWriter, if non-nil, receives one signed audit row per parsed
	// Postgres frame. v0.1.0b ships this as the primary new surface;
	// leaving it nil reduces the proxy to v0.1.0a-equivalent behavior
	// for tests that don't care about audit.
	AuditWriter audit.Writer

	// IdentityVerifier, if non-nil, is consulted when the client's
	// StartupMessage parameters include application_name=vigil:<token>.
	// On verification failure or absence, audit rows are written with
	// AgentID/AgentName empty (NULL in SQLite). Verification failure is
	// non-fatal — observability before enforcement.
	IdentityVerifier Verifier

	// DialUpstream is overridable for tests. If nil, defaults to a 10s
	// TCP dial against UpstreamAddr.
	DialUpstream func(ctx context.Context) (net.Conn, error)

	// Now is the wall-clock function used for audit timestamps.
	// Defaults to time.Now. Tests can override for determinism.
	Now func() time.Time

	mu       sync.Mutex
	listener net.Listener
}

// ListenAndServe binds to ListenAddr and serves incoming Postgres clients
// until ctx is canceled or a fatal accept error occurs.
func (s *Server) ListenAndServe(ctx context.Context) error {
	if s.Logger == nil {
		s.Logger = log.Default()
	}
	if s.Now == nil {
		s.Now = time.Now
	}
	ln, err := net.Listen("tcp", s.ListenAddr)
	if err != nil {
		return fmt.Errorf("pgproxy: listen %s: %w", s.ListenAddr, err)
	}
	s.mu.Lock()
	s.listener = ln
	s.mu.Unlock()

	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()

	s.Logger.Printf("pgproxy: listening on %s, upstream=%s", ln.Addr().String(), s.UpstreamAddr)

	for {
		clientConn, err := ln.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) || ctx.Err() != nil {
				return nil
			}
			s.Logger.Printf("pgproxy: accept error: %v", err)
			return err
		}
		go s.handleConn(ctx, clientConn)
	}
}

// Addr returns the bound listen address; useful for tests with :0 ports.
// Returns nil if ListenAndServe has not yet bound.
func (s *Server) Addr() net.Addr {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.listener == nil {
		return nil
	}
	return s.listener.Addr()
}

func (s *Server) handleConn(ctx context.Context, clientConn net.Conn) {
	defer clientConn.Close()

	clientAddr := clientConn.RemoteAddr().String()
	connID := newConnID()
	s.Logger.Printf("pgproxy: client connected: %s (conn=%s)", clientAddr, connID)
	defer s.Logger.Printf("pgproxy: client disconnected: %s (conn=%s)", clientAddr, connID)

	upstreamConn, err := s.dialUpstream(ctx)
	if err != nil {
		s.Logger.Printf("pgproxy: upstream dial failed: %v", err)
		writeFatalError(clientConn, "08006", fmt.Sprintf("vigil: upstream unreachable: %v", err))
		return
	}
	defer upstreamConn.Close()

	state := &connState{
		connID: connID,
		now:    s.Now,
		writer: s.AuditWriter,
	}
	s.relay(ctx, clientConn, upstreamConn, state)
}

func (s *Server) dialUpstream(ctx context.Context) (net.Conn, error) {
	if s.DialUpstream != nil {
		return s.DialUpstream(ctx)
	}
	d := net.Dialer{Timeout: 10 * time.Second}
	return d.DialContext(ctx, "tcp", s.UpstreamAddr)
}

// connState carries per-connection identity and audit context through
// the pump. It is owned by one goroutine — no locking needed.
type connState struct {
	connID    string
	agentID   string
	agentName string

	// authType tracks the most recent upstream Authentication* sub-code
	// so the next 'p' from the client can be disambiguated for audit
	// purposes. We do not use this for byte forwarding (we forward raw
	// bytes regardless) — only for setting msg_type on the audit row.
	authType uint32

	now    func() time.Time
	writer audit.Writer
}

// relay drives the single-goroutine pump. The startup phase is handled
// in-band (SSL/GSS decline, application_name parsing) before the pump
// loop. After ReadyForQuery (or in fact after the first frame either
// side sends post-startup) we sit in a select-over-both-readers loop
// and audit + forward each frame.
func (s *Server) relay(ctx context.Context, client, upstream net.Conn, state *connState) {
	if err := s.handleStartup(client, upstream, state); err != nil {
		s.Logger.Printf("pgproxy: startup error: %v", err)
		return
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// SetDeadline on both conns when ctx is canceled so the pump exits
	// promptly. Without this an idle Read can hang for a long time.
	go func() {
		<-ctx.Done()
		_ = client.SetDeadline(time.Now())
		_ = upstream.SetDeadline(time.Now())
	}()

	// Single-goroutine pump: we read from both sides via two readers
	// queued through a frames channel. Whichever side has a frame ready
	// is consumed by the loop body in turn. The select-on-channels
	// approach works without per-frame synchronization because all the
	// auth-type bookkeeping happens inside the loop body's single
	// goroutine. Cross-side state (state.authType) is only read/written
	// here.
	type frame struct {
		dir   audit.Direction
		hdr   [5]byte
		body  []byte
		bytes int // total wire bytes for the frame
		err   error
	}

	clientFrames := make(chan frame)
	upstreamFrames := make(chan frame)

	// readerLoop reads frames from one side and posts them to ch.
	// On error it posts a single frame with .err set, then returns.
	// Closing ch is the producer's signal that the side ended.
	readerLoop := func(r io.Reader, dir audit.Direction, ch chan<- frame) {
		defer close(ch)
		for {
			var hdr [5]byte
			if _, err := io.ReadFull(r, hdr[:]); err != nil {
				if isExpectedClose(err) {
					return
				}
				ch <- frame{dir: dir, err: err}
				return
			}
			msgLen := binary.BigEndian.Uint32(hdr[1:])
			if msgLen < 4 {
				ch <- frame{dir: dir, err: fmt.Errorf("invalid msg length: %d", msgLen)}
				return
			}
			bodyLen := int(msgLen) - 4
			body := make([]byte, bodyLen)
			if bodyLen > 0 {
				if _, err := io.ReadFull(r, body); err != nil {
					ch <- frame{dir: dir, err: err}
					return
				}
			}
			ch <- frame{
				dir:   dir,
				hdr:   hdr,
				body:  body,
				bytes: 5 + bodyLen,
			}
		}
	}

	go readerLoop(client, audit.DirClient, clientFrames)
	go readerLoop(upstream, audit.DirServer, upstreamFrames)

	// Pump loop. On each iteration we take whichever side has a frame
	// ready, write it through to the other side byte-for-byte, then
	// audit it. We exit when both reader goroutines have closed their
	// channels.
	clientOpen, upstreamOpen := true, true
	for clientOpen || upstreamOpen {
		select {
		case <-ctx.Done():
			return

		case fr, ok := <-clientFrames:
			if !ok {
				clientOpen = false
				// Closing the client side ends the conversation; we
				// also want to unblock the upstream reader if it's
				// waiting. SetDeadline is already wired to ctx.Done,
				// so cancel() does the job.
				cancel()
				continue
			}
			if fr.err != nil {
				if !isExpectedClose(fr.err) {
					s.Logger.Printf("pgproxy: client read: %v", fr.err)
				}
				cancel()
				clientOpen = false
				continue
			}
			if err := writeFrame(upstream, fr.hdr, fr.body); err != nil {
				if !isExpectedClose(err) {
					s.Logger.Printf("pgproxy: client→upstream write: %v", err)
				}
				cancel()
				continue
			}
			s.auditClientFrame(state, fr.hdr[0], fr.body, fr.bytes)

		case fr, ok := <-upstreamFrames:
			if !ok {
				upstreamOpen = false
				cancel()
				continue
			}
			if fr.err != nil {
				if !isExpectedClose(fr.err) {
					s.Logger.Printf("pgproxy: upstream read: %v", fr.err)
				}
				cancel()
				upstreamOpen = false
				continue
			}
			if err := writeFrame(client, fr.hdr, fr.body); err != nil {
				if !isExpectedClose(err) {
					s.Logger.Printf("pgproxy: upstream→client write: %v", err)
				}
				cancel()
				continue
			}
			s.auditServerFrame(state, fr.hdr[0], fr.body, fr.bytes)
		}
	}
}

// writeFrame writes the 5-byte header and body to w in a single Write,
// preserving wire bytes exactly as we read them.
func writeFrame(w io.Writer, hdr [5]byte, body []byte) error {
	buf := make([]byte, 0, 5+len(body))
	buf = append(buf, hdr[:]...)
	buf = append(buf, body...)
	_, err := w.Write(buf)
	return err
}

// auditClientFrame interprets a client-originated frame and writes one
// audit row. msg_type is derived from the frame's type byte plus, for
// 'p' messages, the connection's most recent upstream auth challenge.
//
// Client message types per the Postgres wire protocol:
//
//	'B' Bind, 'C' Close, 'D' Describe, 'E' Execute, 'F' FunctionCall,
//	'H' Flush, 'P' Parse, 'p' (auth response — context-dependent),
//	'Q' Query (simple), 'S' Sync, 'X' Terminate,
//	'd' CopyData, 'c' CopyDone, 'f' CopyFail.
func (s *Server) auditClientFrame(state *connState, msgType byte, body []byte, bytesTotal int) {
	if state.writer == nil {
		return
	}
	name, queryText := classifyClient(msgType, state.authType, body)
	ev := audit.Event{
		Timestamp: state.now(),
		AgentID:   state.agentID,
		AgentName: state.agentName,
		ConnID:    state.connID,
		Direction: audit.DirClient,
		MsgType:   name,
		QueryText: queryText,
		Bytes:     bytesTotal,
	}
	if err := state.writer.Write(ev); err != nil {
		s.Logger.Printf("pgproxy: audit write: %v", err)
	}
}

// auditServerFrame interprets a server-originated frame and writes one
// audit row. We additionally use this hook to update state.authType for
// 'R' (Authentication*) messages; that bookkeeping must happen before
// the next client 'p' arrives, which is guaranteed by single-goroutine
// processing.
func (s *Server) auditServerFrame(state *connState, msgType byte, body []byte, bytesTotal int) {
	name := classifyServer(msgType, body)

	// Track auth state *first* so a fast follow-up client 'p' is
	// classified correctly even if the audit Write fails.
	if msgType == 'R' && len(body) >= 4 {
		state.authType = binary.BigEndian.Uint32(body[:4])
	}

	if state.writer == nil {
		return
	}
	ev := audit.Event{
		Timestamp: state.now(),
		AgentID:   state.agentID,
		AgentName: state.agentName,
		ConnID:    state.connID,
		Direction: audit.DirServer,
		MsgType:   name,
		Bytes:     bytesTotal,
	}
	if err := state.writer.Write(ev); err != nil {
		s.Logger.Printf("pgproxy: audit write: %v", err)
	}
}

// classifyClient produces a human-readable msg_type for a client frame
// and, for Query/Parse, extracts the SQL text. For 'p' messages the
// authType context disambiguates (PasswordMessage / SASLInitialResponse
// / SASLResponse / GSSResponse).
func classifyClient(msgType byte, authType uint32, body []byte) (string, string) {
	switch msgType {
	case 'B':
		return "Bind", ""
	case 'C':
		return "Close", ""
	case 'D':
		return "Describe", ""
	case 'E':
		return "Execute", ""
	case 'F':
		return "FunctionCall", ""
	case 'H':
		return "Flush", ""
	case 'P':
		return "Parse", parseParseQuery(body)
	case 'p':
		return classifyClientPassword(authType), ""
	case 'Q':
		return "Query", parseSimpleQueryText(body)
	case 'S':
		return "Sync", ""
	case 'X':
		return "Terminate", ""
	case 'd':
		return "CopyData", ""
	case 'c':
		return "CopyDone", ""
	case 'f':
		return "CopyFail", ""
	default:
		return fmt.Sprintf("Client_0x%02x", msgType), ""
	}
}

// classifyClientPassword maps the most recent upstream auth challenge
// to the corresponding 'p' message subtype. Matches pgproto3.Backend's
// 'p' switch; the fallback is PasswordMessage which is what libpq sends
// for cleartext / md5 auth.
func classifyClientPassword(authType uint32) string {
	switch authType {
	case authTypeSASL:
		return "SASLInitialResponse"
	case authTypeSASLContinue:
		return "SASLResponse"
	case authTypeSASLFinal:
		return "SASLResponse"
	case authTypeGSS, authTypeGSSCont:
		return "GSSResponse"
	default:
		return "PasswordMessage"
	}
}

// classifyServer produces a human-readable msg_type for a backend
// (server) frame. Authentication subtypes are spelled out so the
// audit table tells you which step of SCRAM the connection reached.
func classifyServer(msgType byte, body []byte) string {
	switch msgType {
	case '1':
		return "ParseComplete"
	case '2':
		return "BindComplete"
	case '3':
		return "CloseComplete"
	case 'A':
		return "NotificationResponse"
	case 'C':
		return "CommandComplete"
	case 'D':
		return "DataRow"
	case 'E':
		return "ErrorResponse"
	case 'G':
		return "CopyInResponse"
	case 'H':
		return "CopyOutResponse"
	case 'I':
		return "EmptyQueryResponse"
	case 'K':
		return "BackendKeyData"
	case 'N':
		return "NoticeResponse"
	case 'R':
		return classifyAuthMessage(body)
	case 'S':
		return "ParameterStatus"
	case 'T':
		return "RowDescription"
	case 'V':
		return "FunctionCallResponse"
	case 'W':
		return "CopyBothResponse"
	case 'Z':
		return "ReadyForQuery"
	case 'c':
		return "CopyDone"
	case 'd':
		return "CopyData"
	case 'n':
		return "NoData"
	case 's':
		return "PortalSuspended"
	case 't':
		return "ParameterDescription"
	case 'v':
		return "NegotiateProtocolVersion"
	default:
		return fmt.Sprintf("Server_0x%02x", msgType)
	}
}

// classifyAuthMessage reads the first 4 bytes of an Authentication
// message body and returns a name. Falls back to "Authentication" if
// the body is too short to classify.
func classifyAuthMessage(body []byte) string {
	if len(body) < 4 {
		return "Authentication"
	}
	switch binary.BigEndian.Uint32(body[:4]) {
	case authTypeOk:
		return "AuthenticationOk"
	case authTypeCleartextPassword:
		return "AuthenticationCleartextPassword"
	case authTypeMD5Password:
		return "AuthenticationMD5Password"
	case authTypeGSS:
		return "AuthenticationGSS"
	case authTypeGSSCont:
		return "AuthenticationGSSContinue"
	case authTypeSASL:
		return "AuthenticationSASL"
	case authTypeSASLContinue:
		return "AuthenticationSASLContinue"
	case authTypeSASLFinal:
		return "AuthenticationSASLFinal"
	default:
		return "Authentication"
	}
}

// parseSimpleQueryText extracts the SQL string from a Query ('Q') frame
// body. The body is a null-terminated UTF-8 string; we drop the null.
// Returns "" on malformed input — best-effort, never blocks the pump.
func parseSimpleQueryText(body []byte) string {
	if i := bytes.IndexByte(body, 0); i >= 0 {
		return string(body[:i])
	}
	return ""
}

// parseParseQuery extracts the SQL string from a Parse ('P') frame
// body. Body layout: <statement-name>\x00<query>\x00<parameter-count
// uint16><parameter-OIDs...>. We read the second null-terminated string.
func parseParseQuery(body []byte) string {
	first := bytes.IndexByte(body, 0)
	if first < 0 || first+1 >= len(body) {
		return ""
	}
	rest := body[first+1:]
	second := bytes.IndexByte(rest, 0)
	if second < 0 {
		return ""
	}
	return string(rest[:second])
}

// handleStartup reads startup-phase messages directly from the client TCP
// stream. It declines SSLRequest/GSSEncRequest with 'N', forwards the real
// StartupMessage (or a CancelRequest) to upstream verbatim, and parses
// application_name=vigil:<token> for identity attachment along the way.
func (s *Server) handleStartup(client, upstream net.Conn, state *connState) error {
	for {
		// Length prefix is 4 bytes, big-endian, self-inclusive.
		var lenBuf [4]byte
		if _, err := io.ReadFull(client, lenBuf[:]); err != nil {
			return fmt.Errorf("read startup length: %w", err)
		}
		msgLen := binary.BigEndian.Uint32(lenBuf[:])
		if msgLen < 8 || msgLen > maxStartupLen {
			return fmt.Errorf("invalid startup length: %d", msgLen)
		}

		body := make([]byte, msgLen-4)
		if _, err := io.ReadFull(client, body); err != nil {
			return fmt.Errorf("read startup body: %w", err)
		}

		code := binary.BigEndian.Uint32(body[:4])
		switch code {
		case sslRequestCode:
			if _, err := client.Write([]byte{'N'}); err != nil {
				return fmt.Errorf("write SSL decline: %w", err)
			}
			continue
		case gssEncReqCode:
			if _, err := client.Write([]byte{'N'}); err != nil {
				return fmt.Errorf("write GSS decline: %w", err)
			}
			continue
		case cancelRequestCode:
			// Cancel is a one-shot side-channel connection; forward bytes
			// verbatim and let the standard relay copy any tail (there
			// shouldn't be any, but io.Copy handles EOF cleanly).
			if _, err := writeFull(upstream, lenBuf[:], body); err != nil {
				return fmt.Errorf("forward cancel: %w", err)
			}
			return nil
		default:
			// Anything else is a StartupMessage. The protocol-version
			// field is body[0:4]; we accept whatever the client sent
			// (3.0, 3.2, future versions) and let upstream negotiate.
			db := scanStartupParam(body[4:], "database")
			user := scanStartupParam(body[4:], "user")
			appName := scanStartupParam(body[4:], "application_name")
			s.Logger.Printf("pgproxy: startup forwarded: db=%q user=%q proto=0x%08x app=%q conn=%s", db, user, code, appName, state.connID)
			s.attachIdentity(state, appName)
			if _, err := writeFull(upstream, lenBuf[:], body); err != nil {
				return fmt.Errorf("forward startup: %w", err)
			}
			return nil
		}
	}
}

// attachIdentity inspects appName for the vigil:<token> form and, on
// successful Verify, stores the agent_id/agent_name on the connection
// state. Verification failure is non-fatal: we leave AgentID empty so
// audit rows have a NULL agent_id but the conversation continues.
func (s *Server) attachIdentity(state *connState, appName string) {
	const prefix = "vigil:"
	if !strings.HasPrefix(appName, prefix) {
		return
	}
	if s.IdentityVerifier == nil {
		s.Logger.Printf("pgproxy: identity token present but no verifier configured (conn=%s)", state.connID)
		return
	}
	tok := strings.TrimPrefix(appName, prefix)
	id, err := s.IdentityVerifier.Verify(tok)
	if err != nil {
		s.Logger.Printf("pgproxy: identity verify failed (conn=%s): %v", state.connID, err)
		return
	}
	state.agentID = id.ID
	state.agentName = id.AgentName
	s.Logger.Printf("pgproxy: identity attached: agent=%s name=%q (conn=%s)", id.ID, id.AgentName, state.connID)
}

// scanStartupParam extracts the value of a named parameter from the
// null-separated key/value tail of a StartupMessage. Returns "" if the
// key is not present or the encoding is malformed.
func scanStartupParam(params []byte, key string) string {
	parts := splitNul(params)
	for i := 0; i+1 < len(parts); i += 2 {
		if parts[i] == key {
			return parts[i+1]
		}
	}
	return ""
}

func splitNul(b []byte) []string {
	var out []string
	start := 0
	for i, c := range b {
		if c == 0 {
			out = append(out, string(b[start:i]))
			start = i + 1
		}
	}
	return out
}

// writeFull writes the concatenation of bufs to w in a single syscall when
// possible by combining first. Returns the byte count and any error.
func writeFull(w io.Writer, bufs ...[]byte) (int, error) {
	total := 0
	for _, b := range bufs {
		total += len(b)
	}
	combined := make([]byte, 0, total)
	for _, b := range bufs {
		combined = append(combined, b...)
	}
	n, err := w.Write(combined)
	return n, err
}

// writeFatalError synthesizes a Postgres ErrorResponse so the client
// receives a structured error instead of a TCP RST. Used when the upstream
// dial fails before we can forward any bytes.
func writeFatalError(clientConn net.Conn, code, message string) {
	backend := pgproto3.NewBackend(clientConn, clientConn)
	// Drain the startup message so the client doesn't see "unexpected
	// response before startup". Best-effort; the client may already have
	// closed if upstream took a long time to fail.
	_, _ = backend.ReceiveStartupMessage()
	backend.Send(&pgproto3.ErrorResponse{
		Severity: "FATAL",
		Code:     code,
		Message:  message,
	})
	_ = backend.Flush()
}

// isExpectedClose reports whether err indicates a graceful end-of-stream
// rather than a real failure worth logging at error level.
func isExpectedClose(err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}
	var nErr net.Error
	if errors.As(err, &nErr) && nErr.Timeout() {
		// SetDeadline(now) was used by the relay to unblock; don't log.
		return true
	}
	// Some net/pipe close races surface as "use of closed network
	// connection" wrapped in a string error; the errors.Is check above
	// covers net.ErrClosed but operating systems sometimes wrap differently.
	if strings.Contains(err.Error(), "use of closed network connection") {
		return true
	}
	return false
}

// newConnID returns a short random hex string for per-connection
// correlation in audit rows and logs. Not a UUID v4 — we don't need
// dash formatting and 16 hex chars (64 bits) is plenty entropy for
// connection-lifetime uniqueness.
func newConnID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}
