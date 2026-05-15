package mcpserver

// listTools returns the MCP tools/list response shape. Two tools ship
// in v0: vigil.identity.whoami and vigil.activity.query. The May 7
// spec lists more (identity.list, identity.issue, policy.check) but
// they're deferred — read-mostly v0, no admin surface yet.
//
// Each tool entry follows the MCP tool schema: name + description +
// JSON Schema for inputs. Claude Code uses inputSchema to validate
// arguments before calling.
func listTools() any {
	return map[string]any{
		"tools": []map[string]any{
			{
				"name":        "vigil.identity.whoami",
				"description": "Return the calling agent's identity, principal, scopes, and expiration. Returns agent_id=null if the caller is anonymous (no Vigil token configured).",
				"inputSchema": map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
			{
				"name":        "vigil.activity.query",
				"description": "Query the calling agent's audit log. Scoped to the caller's agent_id — anonymous callers see an empty result. Supports time-window and message-type filters.",
				"inputSchema": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"since": map[string]any{
							"type":        "string",
							"description": "RFC3339 timestamp. Only rows newer than this are returned.",
						},
						"limit": map[string]any{
							"type":        "integer",
							"description": "Max rows to return (default 50, max 1000).",
						},
						"msg_type": map[string]any{
							"type":        "string",
							"description": "Filter by Postgres message type (e.g. 'Query', 'Parse'). Exact match.",
						},
					},
				},
			},
		},
	}
}
