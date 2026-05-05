// Package pgproxy implements a transparent Postgres wire-protocol proxy.
//
// v0.1.0a milestone: bytes-equivalent passthrough. Vigil sits between a
// Postgres client and the real Postgres server and relays every byte
// without modification. Connecting through the proxy is indistinguishable
// from connecting direct, which is the test bar for this milestone.
//
// Implementation note: v0.1.0a deliberately runs as a raw byte forwarder
// after the startup negotiation. Going through pgproto3 message-level
// proxying ran into a SCRAM auth-type race — the 'p' message wire format
// (PasswordMessage vs SASLInitialResponse vs SASLResponse) depends on the
// most recent Authentication* response from upstream, but in a two-goroutine
// proxy that signal lives on the upstream→client side and the parser lives
// on the client→upstream side, so propagating it cleanly requires per-
// message synchronization that does not belong in a passthrough milestone.
// v0.1.0b layers identity attachment on top and will introduce a single-
// goroutine message pump where this disambiguation is straightforward.
package pgproxy

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"
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

// Logger is the minimal logger interface pgproxy needs. The standard
// library *log.Logger satisfies it; a no-op implementation is also fine.
type Logger interface {
	Printf(format string, args ...any)
}

// Server is a transparent Postgres proxy. It accepts client connections on
// ListenAddr, dials UpstreamAddr per accepted connection, and relays bytes
// in both directions without modification.
type Server struct {
	ListenAddr   string
	UpstreamAddr string
	Logger       Logger

	// DialUpstream is overridable for tests. If nil, defaults to a 10s
	// TCP dial against UpstreamAddr.
	DialUpstream func(ctx context.Context) (net.Conn, error)

	mu       sync.Mutex
	listener net.Listener
}

// ListenAndServe binds to ListenAddr and serves incoming Postgres clients
// until ctx is canceled or a fatal accept error occurs.
func (s *Server) ListenAndServe(ctx context.Context) error {
	if s.Logger == nil {
		s.Logger = log.Default()
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
	s.Logger.Printf("pgproxy: client connected: %s", clientAddr)
	defer s.Logger.Printf("pgproxy: client disconnected: %s", clientAddr)

	upstreamConn, err := s.dialUpstream(ctx)
	if err != nil {
		s.Logger.Printf("pgproxy: upstream dial failed: %v", err)
		writeFatalError(clientConn, "08006", fmt.Sprintf("vigil: upstream unreachable: %v", err))
		return
	}
	defer upstreamConn.Close()

	relay(ctx, clientConn, upstreamConn, s.Logger)
}

func (s *Server) dialUpstream(ctx context.Context) (net.Conn, error) {
	if s.DialUpstream != nil {
		return s.DialUpstream(ctx)
	}
	d := net.Dialer{Timeout: 10 * time.Second}
	return d.DialContext(ctx, "tcp", s.UpstreamAddr)
}

// relay drives byte-level passthrough in both directions until either side
// returns EOF or a fatal error. The startup phase is handled in-band before
// the io.Copy pumps so we can decline SSL/GSS without forwarding them.
func relay(ctx context.Context, client, upstream net.Conn, logger Logger) {
	if err := handleStartup(client, upstream, logger); err != nil {
		logger.Printf("pgproxy: startup error: %v", err)
		return
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		defer cancel()
		_, err := io.Copy(upstream, client)
		if err != nil && !isExpectedClose(err) {
			logger.Printf("pgproxy: client→upstream copy: %v", err)
		}
	}()

	go func() {
		defer wg.Done()
		defer cancel()
		_, err := io.Copy(client, upstream)
		if err != nil && !isExpectedClose(err) {
			logger.Printf("pgproxy: upstream→client copy: %v", err)
		}
	}()

	go func() {
		<-ctx.Done()
		_ = client.SetDeadline(time.Now())
		_ = upstream.SetDeadline(time.Now())
	}()

	wg.Wait()
}

// handleStartup reads startup-phase messages directly from the client TCP
// stream. It declines SSLRequest/GSSEncRequest with 'N', forwards the real
// StartupMessage (or a CancelRequest) to upstream verbatim, and returns.
// The caller switches to byte-level passthrough afterward.
func handleStartup(client, upstream net.Conn, logger Logger) error {
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
			db, user := scanStartupParam(body[4:], "database"), scanStartupParam(body[4:], "user")
			logger.Printf("pgproxy: startup forwarded: db=%q user=%q proto=0x%08x", db, user, code)
			if _, err := writeFull(upstream, lenBuf[:], body); err != nil {
				return fmt.Errorf("forward startup: %w", err)
			}
			return nil
		}
	}
}

// scanStartupParam extracts the value of a named parameter from the
// null-separated key/value tail of a StartupMessage. Returns "" if the
// key is not present or the encoding is malformed; this is purely for
// log output, so a best-effort scan is fine.
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
	if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
		return true
	}
	var nErr net.Error
	if errors.As(err, &nErr) && nErr.Timeout() {
		// SetDeadline(now) was used by the relay to unblock; don't log.
		return true
	}
	return false
}
