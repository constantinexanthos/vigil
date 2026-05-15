// Package mcpserver implements an MCP (Model Context Protocol) server
// over stdio. Coding agents (Claude Code, Cursor, Codex) install Vigil
// as an MCP server in their config (e.g. ~/.claude/mcp.json) and call
// vigil.identity.whoami / vigil.activity.query to introspect their own
// scope and audit trail.
//
// Wire format: JSON-RPC 2.0 with LSP-style Content-Length framing.
// Each message has a header block (CRLF-terminated lines) followed by
// a blank line and exactly Content-Length bytes of JSON body.
//
// We deliberately don't depend on a JSON-RPC library — the surface we
// implement is small (initialize, tools/list, tools/call, plus error
// responses) and the framing is well-understood. Pinning a third-party
// MCP SDK adds dependency-update churn for marginal benefit.
package mcpserver

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// readMessage reads one Content-Length-framed JSON-RPC message from br
// and returns the raw body bytes. Returns io.EOF on a clean end of
// stream (no bytes available), which the server's read loop uses to
// detect client disconnect — wrapping it would obscure that signal.
//
// Takes *bufio.Reader explicitly so pipelined messages survive across
// successive calls. Wrapping a fresh bufio.Reader around the same
// underlying io.Reader on every call would discard any data the
// previous call buffered ahead.
func readMessage(br *bufio.Reader) ([]byte, error) {
	contentLength := -1
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) && len(line) == 0 {
				return nil, io.EOF
			}
			return nil, fmt.Errorf("mcpserver: read header line: %w", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break // end of header block
		}
		name, value, ok := strings.Cut(line, ":")
		if !ok {
			return nil, fmt.Errorf("mcpserver: malformed header line: %q", line)
		}
		if strings.EqualFold(strings.TrimSpace(name), "Content-Length") {
			n, err := strconv.Atoi(strings.TrimSpace(value))
			if err != nil {
				return nil, fmt.Errorf("mcpserver: bad Content-Length %q: %w", value, err)
			}
			contentLength = n
		}
		// Any other header (Content-Type, etc.) is silently tolerated
		// per the MCP spec.
	}

	if contentLength < 0 {
		return nil, errors.New("mcpserver: missing Content-Length header")
	}
	body := make([]byte, contentLength)
	if _, err := io.ReadFull(br, body); err != nil {
		return nil, fmt.Errorf("mcpserver: read body: %w", err)
	}
	return body, nil
}

// writeMessage writes a Content-Length-framed JSON-RPC response to w.
// The caller is responsible for ensuring body is valid JSON — we don't
// validate here because every call site already marshals through
// encoding/json before reaching this function.
func writeMessage(w io.Writer, body []byte) error {
	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(body))
	if _, err := io.WriteString(w, header); err != nil {
		return fmt.Errorf("mcpserver: write header: %w", err)
	}
	if _, err := w.Write(body); err != nil {
		return fmt.Errorf("mcpserver: write body: %w", err)
	}
	return nil
}
