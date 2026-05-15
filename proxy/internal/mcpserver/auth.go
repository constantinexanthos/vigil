package mcpserver

import (
	"encoding/json"

	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

// Verifier is the subset of *identity.Issuer the MCP server needs.
// Defining the interface here keeps the dependency loose (tests can
// substitute a fake) and matches the pattern pgproxy uses.
type Verifier interface {
	Verify(rawToken string) (identity.Identity, error)
}

// extractTokenFromInitParams pulls a Vigil identity token out of the
// `initialize` request's params. Order of precedence per the May 7
// auth-model design:
//
//  1. params.clientInfo.vigil_token (free-form per MCP spec)
//  2. envFallback (typically os.Getenv("VIGIL_TOKEN"))
//  3. "" (anonymous)
//
// Malformed JSON is non-fatal — the caller still gets to respond
// (with anonymous identity). The MCP installation flow needs whoami
// to succeed-with-null even before the operator has configured auth.
func extractTokenFromInitParams(rawParams json.RawMessage, envFallback string) string {
	var parsed struct {
		ClientInfo struct {
			VigilToken string `json:"vigil_token"`
		} `json:"clientInfo"`
	}
	if err := json.Unmarshal(rawParams, &parsed); err == nil {
		if parsed.ClientInfo.VigilToken != "" {
			return parsed.ClientInfo.VigilToken
		}
	}
	return envFallback
}

// resolveIdentity verifies a token via the Issuer. Returns (zero,
// false) for any failure path — empty token, parse error, signature
// mismatch, expired — so callers can uniformly treat it as anonymous
// without inspecting error categories.
//
// The "treat invalid as anonymous" choice is per the May 7 spec: an
// agent that just installed Vigil and hasn't configured auth yet
// needs `whoami` to return 200 with `agent_id: null`, not an error.
// Auth failure as a hard reject would break the discovery flow.
func resolveIdentity(v Verifier, token string) (identity.Identity, bool) {
	if token == "" {
		return identity.Identity{}, false
	}
	id, err := v.Verify(token)
	if err != nil {
		return identity.Identity{}, false
	}
	return id, true
}
