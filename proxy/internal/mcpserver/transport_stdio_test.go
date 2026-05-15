package mcpserver

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"
)

// MCP wire format = JSON-RPC 2.0 over stdio with Content-Length framing.
// The framing is identical to LSP (the spec borrows from it): each message
// is preceded by `Content-Length: <N>\r\n\r\n` and the body is exactly N
// bytes of JSON. Get this wrong and Claude Code's MCP host refuses to
// connect, with no useful error message.

func bufReader(s string) *bufio.Reader {
	return bufio.NewReader(strings.NewReader(s))
}

func TestReadMessageParsesContentLengthFrame(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`
	frame := fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(body), body)

	got, err := readMessage(bufReader(frame))
	if err != nil {
		t.Fatalf("readMessage: %v", err)
	}
	var msg map[string]any
	if err := json.Unmarshal(got, &msg); err != nil {
		t.Fatalf("decoded payload is not JSON: %v", err)
	}
	if msg["method"] != "initialize" {
		t.Errorf("method = %v, want initialize", msg["method"])
	}
}

// Extra headers (Content-Type, etc.) are allowed by the MCP spec —
// they just have to be tolerated. We don't act on them.
func TestReadMessageIgnoresExtraHeaders(t *testing.T) {
	body := `{"jsonrpc":"2.0"}`
	frame := fmt.Sprintf(
		"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\nContent-Length: %d\r\n\r\n%s",
		len(body), body)
	got, err := readMessage(bufReader(frame))
	if err != nil {
		t.Fatalf("readMessage: %v", err)
	}
	if string(got) != body {
		t.Errorf("body = %q, want %q", got, body)
	}
}

// EOF on a fresh read returns io.EOF (not a parse error). The caller's
// loop uses io.EOF to detect a clean client disconnect — anything else
// gets logged. If we wrap EOF as "missing Content-Length", the server
// spams stderr on every clean shutdown.
func TestReadMessageReturnsEOFOnEmptyStream(t *testing.T) {
	_, err := readMessage(bufReader(""))
	if err != io.EOF {
		t.Errorf("err = %v, want io.EOF", err)
	}
}

// Two framed messages back-to-back: both round-trip. The shared
// *bufio.Reader keeps the second message's bytes in its buffer after
// the first read.
func TestReadMessageHandlesPipeline(t *testing.T) {
	body1 := `{"id":1}`
	body2 := `{"id":2}`
	frame := fmt.Sprintf("Content-Length: %d\r\n\r\n%sContent-Length: %d\r\n\r\n%s",
		len(body1), body1, len(body2), body2)
	r := bufReader(frame)

	got1, err := readMessage(r)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if string(got1) != body1 {
		t.Errorf("first body = %q, want %q", got1, body1)
	}
	got2, err := readMessage(r)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if string(got2) != body2 {
		t.Errorf("second body = %q, want %q", got2, body2)
	}
}

// Missing Content-Length → error. The MCP host MUST frame; if it doesn't,
// something is very wrong (maybe an old SSE-transport client speaking
// the wrong protocol). Fail loud so the operator can investigate.
func TestReadMessageErrorsWithoutContentLength(t *testing.T) {
	frame := "Whatever-Header: x\r\n\r\nhello"
	if _, err := readMessage(bufReader(frame)); err == nil {
		t.Errorf("expected error for missing Content-Length")
	}
}

// QA-010 regression: a single stray garbage line written into the
// stream BEFORE a valid frame must not kill the session. readMessage
// silently skips up to 4KB of garbage looking for the next valid
// Content-Length header.
func TestReadMessageRecoversFromPriorGarbageLine(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`
	frame := "this-is-garbage-with-no-colon\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(body), body)
	got, err := readMessage(bufReader(frame))
	if err != nil {
		t.Fatalf("readMessage: %v (expected recovery from garbage)", err)
	}
	if string(got) != body {
		t.Errorf("body = %q, want %q", got, body)
	}
}

// Multiple stray lines should also be skipped.
func TestReadMessageRecoversFromMultipleGarbageLines(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`
	frame := "junk1\njunk2\njunk3\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(body), body)
	got, err := readMessage(bufReader(frame))
	if err != nil {
		t.Fatalf("readMessage: %v", err)
	}
	if string(got) != body {
		t.Errorf("body = %q, want %q", got, body)
	}
}

// Recovery is bounded — pure noise must not loop forever.
func TestReadMessageGivesUpOnTooMuchGarbage(t *testing.T) {
	garbage := strings.Repeat("garbage_line_with_no_colon\n", 500) // ~13KB
	if _, err := readMessage(bufReader(garbage)); err == nil {
		t.Errorf("expected error on >4KB garbage; got nil")
	}
}

// writeMessage emits the same framing the reader accepts. Round trip
// guarantees the in-process loop's wire format matches the spec.
func TestWriteMessageRoundTrip(t *testing.T) {
	payload := []byte(`{"jsonrpc":"2.0","id":7,"result":{"ok":true}}`)
	var buf bytes.Buffer
	if err := writeMessage(&buf, payload); err != nil {
		t.Fatalf("writeMessage: %v", err)
	}

	got, err := readMessage(bufio.NewReader(&buf))
	if err != nil {
		t.Fatalf("readback: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Errorf("round-trip body = %q, want %q", got, payload)
	}
}
