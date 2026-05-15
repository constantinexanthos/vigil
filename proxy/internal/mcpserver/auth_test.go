package mcpserver

import (
	"encoding/json"
	"testing"

	"github.com/costaxanthos/vigil/proxy/internal/identity"
)

// extractToken pulls the Vigil identity token out of an `initialize`
// request's params per the May 7 spec's auth model:
//
//   1. clientInfo.vigil_token — primary, MCP host passes it in
//      explicitly.
//   2. VIGIL_TOKEN env var — fallback for hosts that don't pass
//      clientInfo through verbatim.
//   3. Neither — caller is anonymous. whoami still returns 200 with
//      agent_id=null so agents installing Vigil can verify the tool
//      works before they configure a token.

func TestExtractTokenFromClientInfo(t *testing.T) {
	params := json.RawMessage(`{
		"clientInfo": {
			"name": "claude-code",
			"vigil_token": "fake-token-string"
		}
	}`)
	got := extractTokenFromInitParams(params, "")
	if got != "fake-token-string" {
		t.Errorf("token = %q, want %q", got, "fake-token-string")
	}
}

// When clientInfo is absent the env var wins. Real-world: Claude Code's
// MCP host today doesn't propagate clientInfo extras, so VIGIL_TOKEN is
// the actual deployment path.
func TestExtractTokenFallsBackToEnv(t *testing.T) {
	params := json.RawMessage(`{"clientInfo": {"name": "claude-code"}}`)
	got := extractTokenFromInitParams(params, "env-token")
	if got != "env-token" {
		t.Errorf("token = %q, want env-token (clientInfo absent)", got)
	}
}

// clientInfo wins over env when both are present. The MCP host's
// explicit intent beats process-level config.
func TestExtractTokenPrefersClientInfoOverEnv(t *testing.T) {
	params := json.RawMessage(`{
		"clientInfo": {"vigil_token": "client-token"}
	}`)
	got := extractTokenFromInitParams(params, "env-token")
	if got != "client-token" {
		t.Errorf("token = %q, want client-token (clientInfo should win)", got)
	}
}

func TestExtractTokenEmptyWhenAbsent(t *testing.T) {
	params := json.RawMessage(`{"clientInfo": {}}`)
	got := extractTokenFromInitParams(params, "")
	if got != "" {
		t.Errorf("token = %q, want empty", got)
	}
}

// Malformed params don't panic — they just produce an empty token. The
// caller still gets to respond to the request (with anonymous identity).
func TestExtractTokenHandlesMalformedParams(t *testing.T) {
	got := extractTokenFromInitParams(json.RawMessage(`not json`), "")
	if got != "" {
		t.Errorf("token = %q, want empty for malformed params", got)
	}
}

// resolveIdentity wraps the Issuer.Verify call. On valid token it
// returns the verified Identity. On empty / invalid / expired token
// it returns the zero Identity and ok=false (NOT an error — caller
// treats this as "anonymous").
func TestResolveIdentityValidToken(t *testing.T) {
	iss, _ := identity.NewIssuer()
	_, tok, _ := iss.Issue(identity.IssueRequest{
		AgentName: "claude-code",
		Principal: "costa@example.com",
		Scopes:    []string{"read"},
	})
	id, ok := resolveIdentity(iss, tok.Token)
	if !ok {
		t.Fatal("valid token should resolve")
	}
	if id.AgentName != "claude-code" {
		t.Errorf("agent = %q, want claude-code", id.AgentName)
	}
}

func TestResolveIdentityEmptyTokenIsAnonymous(t *testing.T) {
	iss, _ := identity.NewIssuer()
	_, ok := resolveIdentity(iss, "")
	if ok {
		t.Error("empty token should resolve to anonymous (ok=false)")
	}
}

func TestResolveIdentityInvalidTokenIsAnonymous(t *testing.T) {
	iss, _ := identity.NewIssuer()
	_, ok := resolveIdentity(iss, "garbage-token-not-signed")
	if ok {
		t.Error("garbage token should resolve to anonymous (ok=false), not error")
	}
}
