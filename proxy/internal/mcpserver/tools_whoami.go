package mcpserver

import "github.com/costaxanthos/vigil/proxy/internal/identity"

// runWhoami builds the vigil.identity.whoami result. If the session is
// authenticated, returns the resolved identity fields. If anonymous,
// returns `agent_id: null` and explicit nulls on the other fields so
// the consuming MCP host always sees a consistent shape.
//
// Wrapped in `content` per MCP's tools/call response convention — the
// host renders the text content in the agent's chat window. The first
// item is always a JSON-text representation; future versions could
// add a structured "data" item too.
func runWhoami(id identity.Identity, authed bool) any {
	var payload map[string]any
	if !authed {
		payload = map[string]any{
			"agent_id":   nil,
			"agent_name": nil,
			"principal":  nil,
			"scopes":     []string{},
			"expires_at": nil,
		}
	} else {
		payload = map[string]any{
			"agent_id":   id.ID,
			"agent_name": id.AgentName,
			"principal":  id.Principal,
			"scopes":     id.Scopes,
			"expires_at": id.ExpiresAt.UTC().Format("2006-01-02T15:04:05Z"),
		}
	}
	return map[string]any{
		"content": []map[string]any{
			{"type": "json", "json": payload},
		},
		// MCP allows duplicating the structured result at the top
		// level for clients that don't render `content`. Both Cursor
		// and Claude Code understand `content`, but we keep this
		// belt-and-suspenders so future hosts work too.
		"identity": payload,
	}
}
