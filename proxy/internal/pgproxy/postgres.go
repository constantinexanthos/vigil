// Package pgproxy implements a transparent Postgres wire-protocol proxy.
//
// v0.1.0a milestone: bytes-equivalent passthrough. Vigil sits between a
// Postgres client and the real Postgres server and relays every message
// without modification. Connecting through the proxy is indistinguishable
// from connecting direct, which is the test bar for this milestone.
//
// The wire layer uses jackc/pgx/v5/pgproto3 so future milestones (identity
// attachment, audit log, rate shaping, fan-out coalescing) can intercept at
// the message level without re-architecting.
package pgproxy

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"
)

// Logger is the minimal logger interface pgproxy needs. The standard
// library *log.Logger satisfies it; a no-op implementation is also fine.
type Logger interface {
	Printf(format string, args ...any)
}

// Server is a transparent Postgres proxy. It accepts client connections on
// ListenAddr, dials UpstreamAddr per accepted connection, and relays
// pgproto3 messages in both directions without modification.
type Server struct {
	ListenAddr   string
	UpstreamAddr string
	Logger       Logger

	// DialUpstream is overridable for tests. If nil, defaults to a 10s
	// TCP dial against UpstreamAddr.
	DialUpstream func(ctx context.Context) (net.Conn, error)

	// listener is exposed via Addr() once ListenAndServe has bound.
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

	// Close the listener when ctx is cancelled so Accept unblocks.
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

// relay drives the pgproto3 message pumps in both directions until either
// side returns EOF or a fatal error.
func relay(ctx context.Context, client, upstream net.Conn, logger Logger) {
	backend := pgproto3.NewBackend(client, client)
	frontend := pgproto3.NewFrontend(upstream, upstream)

	// Startup handshake: client may send SSLRequest first; we decline and
	// expect a regular StartupMessage to follow.
	if err := handleStartup(client, backend, frontend, logger); err != nil {
		logger.Printf("pgproxy: startup error: %v", err)
		return
	}

	// After startup, both directions are independent message pumps.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)

	// client → upstream: read frontend messages from the client backend,
	// forward to the upstream frontend.
	go func() {
		defer wg.Done()
		defer cancel()
		for {
			msg, err := backend.Receive()
			if err != nil {
				if !isExpectedClose(err) {
					logger.Printf("pgproxy: client→upstream read: %v", err)
				}
				return
			}
			logQueryIfApplicable(msg, logger)
			frontend.Send(msg)
			if err := frontend.Flush(); err != nil {
				logger.Printf("pgproxy: client→upstream flush: %v", err)
				return
			}
		}
	}()

	// upstream → client: read backend messages from the upstream frontend,
	// forward to the client backend.
	go func() {
		defer wg.Done()
		defer cancel()
		for {
			msg, err := frontend.Receive()
			if err != nil {
				if !isExpectedClose(err) {
					logger.Printf("pgproxy: upstream→client read: %v", err)
				}
				return
			}
			backend.Send(msg)
			if err := backend.Flush(); err != nil {
				logger.Printf("pgproxy: upstream→client flush: %v", err)
				return
			}
		}
	}()

	// When ctx is cancelled (either side hit EOF, or parent shutdown),
	// kick both connections so the other goroutine unblocks too.
	go func() {
		<-ctx.Done()
		_ = client.SetDeadline(time.Now())
		_ = upstream.SetDeadline(time.Now())
	}()

	wg.Wait()
}

// handleStartup processes the optional SSLRequest and the mandatory
// StartupMessage. SSL is declined ('N') in v0.1.0a; documented as a TODO.
func handleStartup(clientConn net.Conn, backend *pgproto3.Backend, frontend *pgproto3.Frontend, logger Logger) error {
	for {
		msg, err := backend.ReceiveStartupMessage()
		if err != nil {
			return fmt.Errorf("receive startup: %w", err)
		}
		switch m := msg.(type) {
		case *pgproto3.SSLRequest:
			// Decline TLS. Postgres clients fall back to plaintext or
			// error per their own config. TLS termination is not in
			// the v0.1.0a milestone; tracked for a later milestone.
			if _, err := clientConn.Write([]byte{'N'}); err != nil {
				return fmt.Errorf("write SSL decline: %w", err)
			}
			continue
		case *pgproto3.GSSEncRequest:
			// Same treatment: decline GSS encryption.
			if _, err := clientConn.Write([]byte{'N'}); err != nil {
				return fmt.Errorf("write GSS decline: %w", err)
			}
			continue
		case *pgproto3.StartupMessage:
			// Forward to upstream. From this point on, both sides
			// exchange regular wire messages.
			logger.Printf("pgproxy: startup forwarded: db=%q user=%q",
				m.Parameters["database"], m.Parameters["user"])
			frontend.Send(m)
			return frontend.Flush()
		case *pgproto3.CancelRequest:
			// Forward cancel requests transparently. Cancel is a separate
			// short-lived connection that doesn't go through normal
			// startup; just proxy the message and let the upstream handle
			// the rest of the lifecycle.
			frontend.Send(m)
			if err := frontend.Flush(); err != nil {
				return fmt.Errorf("flush cancel: %w", err)
			}
			return nil
		default:
			return fmt.Errorf("unexpected startup message type %T", m)
		}
	}
}

// logQueryIfApplicable logs the message type and (for Query/Parse) the
// query text length. Query text itself is not logged at INFO level — it
// may contain PII. v0.1.0b adds configurable redacted query logging.
func logQueryIfApplicable(msg pgproto3.FrontendMessage, logger Logger) {
	switch m := msg.(type) {
	case *pgproto3.Query:
		logger.Printf("pgproxy: Query (len=%d, agent=unknown)", len(m.String))
	case *pgproto3.Parse:
		logger.Printf("pgproxy: Parse name=%q (len=%d, agent=unknown)", m.Name, len(m.Query))
	}
}

// writeFatalError synthesizes a Postgres ErrorResponse + Terminate so the
// client receives a structured error instead of a TCP RST.
func writeFatalError(clientConn net.Conn, code, message string) {
	backend := pgproto3.NewBackend(clientConn, clientConn)
	// Drain the startup message before responding so the client doesn't
	// see "unexpected response before startup". Best-effort.
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
