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
	"github.com/costaxanthos/vigil/proxy/internal/processdetect"
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

	// RateLimiter, if non-nil, is consulted before each client-originated
	// frame is forwarded to upstream. Implementation lives in
	// proxy/internal/ratelimit/ (Agent 1, push 2026-05-15). Nil = no
	// limiting (all calls are implicitly DecisionAllowed).
	RateLimiter RateLimiter

	// Coalescer, if non-nil, is consulted before forwarding read-only
	// Query/Parse frames whose connection is outside an explicit
	// transaction. Implementation lives in proxy/internal/coalesce/
	// (Agent 2, push 2026-05-15). Nil = no caching (every query
	// reaches upstream).
	Coalescer Coalescer

	// ProcessDetector, if non-nil, is consulted at handleConn after
	// IdentityVerifier fails (or absents) to attach Tier-1 inferred
	// identity from the client process tree. Implementation lives in
	// proxy/internal/processdetect (Sub-project B, push 2026-05-15).
	// Nil = no detection — connections without declared identity
	// fall through to AgentSource='anonymous'.
	//
	// The decision tree on every accept is exactly:
	//
	//  1. declared identity from application_name=vigil:<token>
	//     → agentID + agentName + agent_source='declared'
	//  2. ProcessDetector returns non-empty identity
	//     → agentID="" + agentName + agent_source='inferred'
	//  3. neither
	//     → all empty + agent_source='anonymous'
	//
	// Inferred identities do NOT enable coalescing (the coalescer's
	// own `agentID != ""` guard already excludes them). They DO
	// drive per-agent rate-limit buckets via the BucketKey
	// computation in connState below.
	ProcessDetector ProcessDetector

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

	// Tier-1 detection: capture the inferred identity from the
	// client's process tree BEFORE we touch the upstream or parse
	// startup. Running here means the lookup races with the
	// client's StartupMessage send, but in practice the client
	// hasn't exited yet (it's mid-handshake). If we waited until
	// after upstream dial + startup parse, the client process
	// could exit before we walk it; this ordering gives us the
	// strongest detection rate.
	//
	// Failure here is non-fatal: the detector returns an empty
	// identity and we fall through to the declared-or-anonymous
	// path. inferredIdentity is stashed for attachIdentity to read
	// after declared-identity attachment runs (declared wins).
	var inferred processdetect.DetectedIdentity
	if s.ProcessDetector != nil {
		var err error
		inferred, err = s.ProcessDetector.DetectFromConn(clientConn)
		if err != nil {
			s.Logger.Printf("pgproxy: process detection error (conn=%s): %v", connID, err)
		}
	}

	upstreamConn, err := s.dialUpstream(ctx)
	if err != nil {
		s.Logger.Printf("pgproxy: upstream dial failed: %v", err)
		writeFatalError(clientConn, "08006", fmt.Sprintf("vigil: upstream unreachable: %v", err))
		return
	}
	defer upstreamConn.Close()

	state := &connState{
		connID:   connID,
		now:      s.Now,
		writer:   s.AuditWriter,
		inferred: inferred,
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

	// agentSource is one of "declared", "inferred", "anonymous".
	// Threaded onto every audit row for the connection. Set once at
	// startup time (in handleConn) and never changed during the
	// connection.
	agentSource string

	// inferred carries the result of the Tier-1 ProcessDetector
	// lookup performed in handleConn (before startup parsing). It
	// is consulted by attachIdentity to decide the agent_source —
	// declared identity wins if also present.
	inferred processdetect.DetectedIdentity

	// authType tracks the most recent upstream Authentication* sub-code
	// so the next 'p' from the client can be disambiguated for audit
	// purposes. We do not use this for byte forwarding (we forward raw
	// bytes regardless) — only for setting msg_type on the audit row.
	authType uint32

	// txDepth tracks open transactions inferred from simple-protocol
	// BEGIN/START TRANSACTION (++) and COMMIT/ROLLBACK/END (--).
	// Coalescing must be skipped when txDepth > 0 — returning a cached
	// SELECT inside a transaction violates Postgres isolation. v0.1.0c
	// prep ships simple-protocol tracking only; extended-protocol
	// (Parse 'BEGIN') is rare in practice and can be added by Agent 2
	// in a follow-up file under pgproxy/ if needed.
	txDepth int

	// database and user are captured from the StartupMessage parameters
	// so the Coalescer can include them in CacheKey. Empty when not
	// supplied by the client.
	database string
	user     string

	// Coalesce response-capture state machine (v0.1.0d). When a client
	// 'Q' frame missed the cache and we forwarded it upstream, we mark
	// capture=true and accumulate every server frame (header+body) into
	// coalesceBuf until we see ReadyForQuery — at which point we hand
	// the bytes to Coalescer.Store under coalesceKey and reset.
	//
	// Bounded by Coalescer's per-entry size cap (it drops on Store), so
	// no need to cap here. We use a bytes.Buffer for amortized growth.
	coalesceCapture bool
	coalesceKey     CacheKey
	coalesceBuf     bytes.Buffer

	now    func() time.Time
	writer audit.Writer
}

// rateLimitBucketKey returns the key used to bucket a connection's
// frames in the RateLimiter. Resolution order:
//
//  1. If state.agentID is non-empty (Tier-2 declared), use it
//     directly — declared identities get their own per-agent bucket
//     keyed on the canonical agent ID issued by identity.Issuer.
//  2. Else if state.agentName is one of the human-tier slugs
//     ("human", "human-script"), use "human:<agentName>" — the
//     RateLimiter recognises the prefix and maps it to the
//     production pool. The brief is explicit that humans should
//     not be throttled hard.
//  3. Else if state.agentName is non-empty (Tier-1 inferred), use
//     "inferred:<agentName>" — agents detected from the process tree
//     share a bucket per harness slug ("inferred:cursor", etc.).
//     This implements the "Cursor drains the agents pool while
//     Claude Code still flows freely" semantic from the brief.
//  4. Else, use "" — the existing anonymous-bucket key. The
//     ratelimit.Limiter maps "" to the unauth pool.
//
// The "inferred:" / "human:" prefixes prevent collision with a
// future declared agent_id of the same string and let the
// ratelimit.Limiter route them to different pools without needing
// to thread two fields through the interface signature.
func rateLimitBucketKey(state *connState) string {
	if state.agentID != "" {
		return state.agentID
	}
	switch state.agentName {
	case "human", "human-script":
		return "human:" + state.agentName
	}
	if state.agentName != "" {
		return "inferred:" + state.agentName
	}
	return ""
}

// updateTxDepth advances state.txDepth based on a simple-protocol
// Query body. Called BEFORE auditing/forwarding so coalescing
// decisions made later in the same iteration see the right depth.
// Extended-protocol BEGIN via Parse+Bind+Execute is rare and not
// handled in v0.1.0c prep.
func updateTxDepth(state *connState, msgType byte, body []byte) {
	if msgType != 'Q' {
		return
	}
	q := strings.ToUpper(strings.TrimSpace(parseSimpleQueryText(body)))
	switch {
	case strings.HasPrefix(q, "BEGIN"), strings.HasPrefix(q, "START TRANSACTION"):
		state.txDepth++
	case strings.HasPrefix(q, "COMMIT"), strings.HasPrefix(q, "ROLLBACK"), strings.HasPrefix(q, "END"):
		if state.txDepth > 0 {
			state.txDepth--
		}
	}
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
			// Update tx depth from simple-protocol BEGIN/COMMIT/ROLLBACK
			// before any coalescer consultation can read it.
			updateTxDepth(state, fr.hdr[0], fr.body)

			// Coalescer hook (v0.1.0d) — consulted FIRST. Cache hits never
			// reach upstream and therefore must never consume a rate-limit
			// token (rate limiting exists to protect upstream; if we don't
			// touch upstream, we don't need to throttle). Order matters:
			// putting Acquire before Lookup made the bench's 93%-cache-hit
			// workload pay tokens for queries that never left the proxy.
			//
			// Simple-protocol 'Q' frames outside any transaction are
			// candidates. Extended-protocol (Parse/Bind/Execute) is not yet
			// wired — pgx workloads that bind params via 'B' won't coalesce
			// until a follow-up adds the multi-frame capture state machine.
			if s.Coalescer != nil &&
				fr.hdr[0] == 'Q' &&
				state.txDepth == 0 &&
				state.agentID != "" {

				queryText := parseSimpleQueryText(fr.body)
				if isCoalescableSimpleQuery(queryText) {
					key := CacheKey{
						QueryText: queryText,
						Database:  state.database,
						User:      state.user,
					}
					if cached, hit := s.Coalescer.Lookup(state.agentID, key); hit {
						if _, err := client.Write(cached); err != nil {
							if !isExpectedClose(err) {
								s.Logger.Printf("pgproxy: coalesce replay write: %v", err)
							}
							cancel()
							continue
						}
						s.auditClientFrame(state, fr.hdr[0], fr.body, fr.bytes, DecisionCoalesced)
						continue
					}
					// Miss — arm the capture state machine so the next
					// upstream frames get tee'd into coalesceBuf until
					// ReadyForQuery, then handed to Coalescer.Store.
					state.coalesceCapture = true
					state.coalesceKey = key
					state.coalesceBuf.Reset()
				}
			}

			// Rate limiter hook (v0.1.0c) — only reached on cache miss
			// (or for traffic that's not coalesce-eligible). Acquire may
			// block until a token is available; the returned Decision
			// threads into the audit row so the dashboard can distinguish
			// allowed vs throttled traffic.
			//
			// Bucket key: declared agentID > "inferred:<agentName>" >
			// "" (anonymous). See rateLimitBucketKey for the full
			// resolution table. The change in v0.1.0e is that
			// inferred identities get their own per-harness bucket
			// instead of sharing the anonymous unauth pool — Cursor
			// can now drain the agents pool without throttling
			// Claude Code.
			decision := DecisionAllowed
			if s.RateLimiter != nil {
				d, err := s.RateLimiter.Acquire(ctx, rateLimitBucketKey(state), classifyRoute(fr.hdr[0]))
				if err != nil {
					if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
						s.Logger.Printf("pgproxy: rate-limit acquire: %v", err)
					}
					cancel()
					continue
				}
				decision = d
			}

			if err := writeFrame(upstream, fr.hdr, fr.body); err != nil {
				if !isExpectedClose(err) {
					s.Logger.Printf("pgproxy: client→upstream write: %v", err)
				}
				cancel()
				continue
			}
			s.auditClientFrame(state, fr.hdr[0], fr.body, fr.bytes, decision)

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

			// Coalesce response capture (v0.1.0d). If the previous client
			// frame was a coalescable Query that missed the cache, tee
			// every server frame into coalesceBuf. On ReadyForQuery the
			// response is complete — hand the accumulated bytes to
			// Coalescer.Store for replay on the next Lookup hit. Coalescer
			// enforces its own per-response size cap; nothing to bound here.
			if state.coalesceCapture {
				state.coalesceBuf.Write(fr.hdr[:])
				state.coalesceBuf.Write(fr.body)
				if fr.hdr[0] == 'Z' { // ReadyForQuery — response complete
					if s.Coalescer != nil {
						captured := make([]byte, state.coalesceBuf.Len())
						copy(captured, state.coalesceBuf.Bytes())
						s.Coalescer.Store(state.agentID, state.coalesceKey, captured)
					}
					state.coalesceCapture = false
					state.coalesceBuf.Reset()
				}
			}
		}
	}
}

// isCoalescableSimpleQuery reports whether a simple-protocol Query
// payload is a candidate for the Coalescer. We pre-filter here so the
// pump avoids consulting the cache for INSERT/UPDATE/DELETE/DDL/BEGIN —
// queries that can never coalesce anyway. Case-insensitive prefix match
// on the trimmed query text.
func isCoalescableSimpleQuery(q string) bool {
	trimmed := strings.TrimLeft(q, " \t\r\n")
	if len(trimmed) < 6 {
		return false
	}
	up := strings.ToUpper(trimmed[:min(8, len(trimmed))])
	return strings.HasPrefix(up, "SELECT ") ||
		strings.HasPrefix(up, "SELECT\t") ||
		strings.HasPrefix(up, "WITH ") ||
		strings.HasPrefix(up, "WITH\t")
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
func (s *Server) auditClientFrame(state *connState, msgType byte, body []byte, bytesTotal int, decision Decision) {
	if state.writer == nil {
		return
	}
	name, queryText := classifyClient(msgType, state.authType, body)
	ev := audit.Event{
		Timestamp:   state.now(),
		AgentID:     state.agentID,
		AgentName:   state.agentName,
		ConnID:      state.connID,
		Direction:   audit.DirClient,
		MsgType:     name,
		QueryText:   queryText,
		Bytes:       bytesTotal,
		Decision:    string(decision),
		AgentSource: state.agentSource,
	}
	if err := state.writer.Write(ev); err != nil {
		s.Logger.Printf("pgproxy: audit write: %v", err)
	}
}

// classifyRoute maps a client-originated Postgres message type to the
// route name used for per-route rate limiting. The default for unknown
// types is "other"; v0.1.0c's RateLimiter treats all routes equally,
// but the seam is here for v2 per-route weighting.
func classifyRoute(msgType byte) string {
	switch msgType {
	case 'Q':
		return "simple_query"
	case 'P':
		return "parse"
	case 'B':
		return "bind"
	case 'E':
		return "execute"
	case 'S':
		return "sync"
	case 'p':
		return "auth"
	default:
		return "other"
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
		Timestamp:   state.now(),
		AgentID:     state.agentID,
		AgentName:   state.agentName,
		ConnID:      state.connID,
		Direction:   audit.DirServer,
		MsgType:     name,
		Bytes:       bytesTotal,
		AgentSource: state.agentSource,
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
			state.database = db
			state.user = user
			s.attachIdentity(state, appName)
			if _, err := writeFull(upstream, lenBuf[:], body); err != nil {
				return fmt.Errorf("forward startup: %w", err)
			}
			return nil
		}
	}
}

// attachIdentity applies the three-tier identity decision to the
// connection state:
//
//  1. If appName is "vigil:<token>" and IdentityVerifier accepts it,
//     attach declared identity (agentID + agentName) and set
//     agentSource='declared'. This is the existing v0.1.0b path
//     and its behaviour is unchanged — declared identity always
//     wins.
//  2. Else if the connection's inferred identity (resolved before
//     startup parsing) is non-empty, attach inferred identity
//     (agentName only, agentID left empty so coalescing's
//     `agentID != ""` guard naturally excludes it) and set
//     agentSource='inferred'.
//  3. Else, leave everything empty and set agentSource='anonymous'.
//
// Verification failure on a present token is non-fatal: we log it
// and fall through to the inferred branch — observability before
// enforcement. A bad token alongside a clean inferred chain
// produces an audited connection with the inferred name (better
// than dropping the conn).
func (s *Server) attachIdentity(state *connState, appName string) {
	const prefix = "vigil:"
	declared := false
	if strings.HasPrefix(appName, prefix) {
		switch {
		case s.IdentityVerifier == nil:
			s.Logger.Printf("pgproxy: identity token present but no verifier configured (conn=%s)", state.connID)
		default:
			tok := strings.TrimPrefix(appName, prefix)
			id, err := s.IdentityVerifier.Verify(tok)
			if err != nil {
				s.Logger.Printf("pgproxy: identity verify failed (conn=%s): %v", state.connID, err)
			} else {
				state.agentID = id.ID
				state.agentName = id.AgentName
				state.agentSource = AgentSourceDeclared
				s.Logger.Printf("pgproxy: identity attached (declared): agent=%s name=%q (conn=%s)", id.ID, id.AgentName, state.connID)
				declared = true
			}
		}
	}

	if !declared {
		if !state.inferred.Empty() {
			// Inferred identities do not have a stable agent_id.
			// We leave agentID empty so coalesce.Lookup's
			// `agentID != ""` guard naturally excludes them; rate
			// limiting buckets them on agentName via the BucketKey
			// helper.
			state.agentName = state.inferred.AgentName
			state.agentSource = AgentSourceInferred
			s.Logger.Printf("pgproxy: identity attached (inferred): name=%q harness=%q conf=%q chain=%v (conn=%s)",
				state.inferred.AgentName, state.inferred.HarnessName,
				state.inferred.Confidence, state.inferred.ProcessChain, state.connID)
		} else {
			state.agentSource = AgentSourceAnonymous
		}
	}
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
