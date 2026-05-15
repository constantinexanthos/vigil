package mcpserver

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"

	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

// Server runs the JSON-RPC 2.0 read/dispatch/write loop. One Server per
// stdio session — the caller's responsibility to spawn one per spawned
// subprocess. Stateless across runs except the resolved-identity that
// `initialize` sets up.
type Server struct {
	verifier       Verifier
	auditDBPath    string
	envTokenLookup func() string
	logger         *log.Logger

	// Session state, set by `initialize`. Subsequent tool/call requests
	// see this without re-parsing.
	sessionIdentity   identity.Identity
	sessionAuthed     bool
	sessionInitialized bool
}

// Options configures a new Server. Verifier is required; the rest fall
// back to safe defaults.
type Options struct {
	Verifier       Verifier
	AuditDBPath    string      // path to ~/.vigil/proxy.db; ":memory:" for tests
	EnvTokenLookup func() string // typically: func() string { return os.Getenv("VIGIL_TOKEN") }
	Logger         *log.Logger
}

// New builds a Server. Defaults the env lookup to always-empty and the
// logger to log.Default if not provided.
func New(opts Options) *Server {
	if opts.EnvTokenLookup == nil {
		opts.EnvTokenLookup = func() string { return "" }
	}
	if opts.Logger == nil {
		opts.Logger = log.Default()
	}
	return &Server{
		verifier:       opts.Verifier,
		auditDBPath:    opts.AuditDBPath,
		envTokenLookup: opts.EnvTokenLookup,
		logger:         opts.Logger,
	}
}

// Run drives the read/dispatch/write loop until EOF on the reader. On
// EOF we return nil (clean shutdown). Any other read error bubbles up;
// any write error logs and continues (the next message will fail-fast).
func (s *Server) Run(ctx context.Context, r io.Reader, w io.Writer) error {
	br := bufio.NewReader(r)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		body, err := readMessage(br)
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("mcpserver: read: %w", err)
		}

		resp := s.dispatch(body)
		if resp == nil {
			// Notification (no id) — no response sent. JSON-RPC 2.0
			// allows this for things like `notifications/initialized`.
			continue
		}
		respBytes, err := json.Marshal(resp)
		if err != nil {
			// Should never happen — we control the response shape.
			s.logger.Printf("mcpserver: marshal response: %v", err)
			continue
		}
		if err := writeMessage(w, respBytes); err != nil {
			s.logger.Printf("mcpserver: write: %v", err)
			// Don't return — keep reading; the next message may also
			// fail to write, at which point the read loop's EOF will
			// catch us.
		}
	}
}

// rpcRequest matches the JSON-RPC 2.0 request shape. ID is a json.RawMessage
// so we can echo it back verbatim — JSON-RPC allows int or string IDs,
// and the spec is explicit that responses MUST use the same type.
type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

// rpcResponse is the JSON-RPC 2.0 response shape. Exactly one of Result
// or Error is populated.
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

const (
	codeParseError     = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternalError  = -32603
)

// dispatch routes one request to its handler. Returns nil for
// notifications (no id), or a populated *rpcResponse otherwise.
func (s *Server) dispatch(body []byte) *rpcResponse {
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return &rpcResponse{
			JSONRPC: "2.0",
			Error:   &rpcError{Code: codeParseError, Message: err.Error()},
		}
	}
	// Notification: no id, no response.
	isNotification := len(req.ID) == 0 || string(req.ID) == "null"

	resp := &rpcResponse{JSONRPC: "2.0", ID: req.ID}
	switch req.Method {
	case "initialize":
		resp.Result = s.handleInitialize(req.Params)
	case "notifications/initialized":
		// Client confirmation that initialization is done; no response
		// required by the MCP spec. Drop on the floor.
		return nil
	case "tools/list":
		resp.Result = listTools()
	case "tools/call":
		result, rerr := s.handleToolCall(req.Params)
		if rerr != nil {
			resp.Error = rerr
		} else {
			resp.Result = result
		}
	default:
		resp.Error = &rpcError{
			Code:    codeMethodNotFound,
			Message: "method not found: " + req.Method,
		}
	}

	if isNotification {
		return nil
	}
	return resp
}

// handleInitialize processes the MCP `initialize` request. We resolve
// the caller's identity here (via clientInfo.vigil_token + env
// fallback) and stash it on the Server for subsequent tool calls.
// Returns the standard MCP initialize result.
func (s *Server) handleInitialize(params json.RawMessage) any {
	token := extractTokenFromInitParams(params, s.envTokenLookup())
	if s.verifier != nil {
		id, ok := resolveIdentity(s.verifier, token)
		s.sessionIdentity = id
		s.sessionAuthed = ok
	}
	s.sessionInitialized = true
	return map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities": map[string]any{
			"tools": map[string]any{},
		},
		"serverInfo": map[string]any{
			"name":    "vigil",
			"version": "v0.1.0d",
		},
	}
}

// handleToolCall dispatches to the named tool. Errors mapped to
// JSON-RPC error codes; tool-specific failures (DB unavailable, etc.)
// surface as InternalError.
func (s *Server) handleToolCall(params json.RawMessage) (any, *rpcError) {
	var req struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, &rpcError{Code: codeInvalidParams, Message: err.Error()}
	}

	switch req.Name {
	case "vigil.identity.whoami":
		return runWhoami(s.sessionIdentity, s.sessionAuthed), nil
	case "vigil.activity.query":
		out, err := runActivityQuery(s.auditDBPath, s.sessionIdentity, s.sessionAuthed, req.Arguments)
		if err != nil {
			return nil, &rpcError{Code: codeInternalError, Message: err.Error()}
		}
		return out, nil
	default:
		return nil, &rpcError{
			Code:    codeMethodNotFound,
			Message: "tool not found: " + req.Name,
		}
	}
}
