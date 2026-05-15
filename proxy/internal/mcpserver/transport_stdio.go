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
// Tolerant to garbage / malformed lines BEFORE the Content-Length
// header: we silently skip any line that doesn't look like a valid
// header until we either find one or exhaust the byte budget. This
// recovers from a corrupted stream after a previous bad message —
// without recovery, one stray newline written into stdin would kill
// the entire session (QA-010 from the 2026-05-15 QA report).
//
// Takes *bufio.Reader explicitly so pipelined messages survive across
// successive calls. Wrapping a fresh bufio.Reader around the same
// underlying io.Reader on every call would discard any data the
// previous call buffered ahead.
//
// maxRecoveryBytes bounds how much garbage we'll skip before giving
// up — prevents an infinite read loop on a stream of pure noise.
const maxRecoveryBytes = 4096

func readMessage(br *bufio.Reader) ([]byte, error) {
	contentLength := -1
	skipped := 0
	foundFirstHeader := false
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
			if foundFirstHeader {
				break // end of header block
			}
			// Blank line before any real header — could be leftover
			// from a previous bad frame. Skip and keep looking.
			skipped++
			if skipped > maxRecoveryBytes {
				return nil, errors.New("mcpserver: gave up after >4KB of pre-header garbage")
			}
			continue
		}
		name, value, ok := strings.Cut(line, ":")
		if !ok {
			// Garbage line, not a valid `Name: value` header. Skip as
			// part of stream recovery; bound by skipped budget.
			skipped += len(line) + 1
			if skipped > maxRecoveryBytes {
				return nil, errors.New("mcpserver: gave up after >4KB of garbage looking for header")
			}
			continue
		}
		if strings.EqualFold(strings.TrimSpace(name), "Content-Length") {
			n, err := strconv.Atoi(strings.TrimSpace(value))
			if err != nil {
				// Malformed Content-Length value. Treat as garbage and
				// keep scanning for the next valid header.
				skipped += len(line) + 1
				if skipped > maxRecoveryBytes {
					return nil, fmt.Errorf("mcpserver: gave up after bad Content-Length and >4KB garbage: %w", err)
				}
				continue
			}
			contentLength = n
			foundFirstHeader = true
			continue
		}
		// Any other valid header (Content-Type, etc.) is silently
		// tolerated per the MCP spec.
		foundFirstHeader = true
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
