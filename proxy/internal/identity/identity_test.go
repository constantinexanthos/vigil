package identity

import (
	"strings"
	"testing"
	"time"
)

func TestIssueAndVerifyRoundTrip(t *testing.T) {
	iss, err := NewIssuer()
	if err != nil {
		t.Fatalf("NewIssuer: %v", err)
	}

	id, tok, err := iss.Issue(IssueRequest{
		AgentName: "claude-code",
		Principal: "costa@example.com",
		Scopes:    []string{"read", "write"},
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	if id.ID == "" {
		t.Fatal("expected non-empty id")
	}
	if id.AgentName != "claude-code" {
		t.Errorf("agent name = %q, want claude-code", id.AgentName)
	}
	if !strings.Contains(tok.Token, ".") {
		t.Errorf("token missing separator: %q", tok.Token)
	}

	got, err := iss.Verify(tok.Token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.ID != id.ID {
		t.Errorf("verified id = %q, want %q", got.ID, id.ID)
	}
	if got.Principal != "costa@example.com" {
		t.Errorf("verified principal = %q, want costa@example.com", got.Principal)
	}
}

func TestIssueRequiresAgentName(t *testing.T) {
	iss, _ := NewIssuer()
	_, _, err := iss.Issue(IssueRequest{Principal: "x"})
	if err == nil {
		t.Fatal("expected error for missing agent_name, got nil")
	}
}

func TestIssueRequiresPrincipal(t *testing.T) {
	iss, _ := NewIssuer()
	_, _, err := iss.Issue(IssueRequest{AgentName: "x"})
	if err == nil {
		t.Fatal("expected error for missing principal, got nil")
	}
}

func TestVerifyRejectsTampered(t *testing.T) {
	iss, _ := NewIssuer()
	_, tok, _ := iss.Issue(IssueRequest{
		AgentName: "claude-code",
		Principal: "p",
	})
	tampered := tok.Token[:len(tok.Token)-2] + "XX"
	if _, err := iss.Verify(tampered); err == nil {
		t.Fatal("expected verify to reject tampered token, got nil")
	}
}

func TestVerifyRejectsCrossIssuer(t *testing.T) {
	a, _ := NewIssuer()
	b, _ := NewIssuer()
	_, tok, _ := a.Issue(IssueRequest{AgentName: "x", Principal: "p"})
	if _, err := b.Verify(tok.Token); err == nil {
		t.Fatal("expected b to reject a's token, got nil")
	}
}

func TestCustomTTL(t *testing.T) {
	iss, _ := NewIssuer()
	id, _, err := iss.Issue(IssueRequest{
		AgentName: "x",
		Principal: "p",
		TTL:       "5m",
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	dur := id.ExpiresAt.Sub(id.IssuedAt)
	if dur < 4*time.Minute || dur > 6*time.Minute {
		t.Errorf("ttl = %v, want ~5m", dur)
	}
}

func TestMemStoreSaveAndGet(t *testing.T) {
	store := NewMemStore()
	id := Identity{ID: "abc", AgentName: "claude-code", Principal: "p"}
	if err := store.Save(id); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := store.Get("abc")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.AgentName != "claude-code" {
		t.Errorf("agent = %q, want claude-code", got.AgentName)
	}
}

func TestMemStoreGetMissing(t *testing.T) {
	store := NewMemStore()
	_, err := store.Get("nope")
	if err != ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestMemStoreList(t *testing.T) {
	store := NewMemStore()
	now := time.Now().UTC()
	_ = store.Save(Identity{ID: "a", AgentName: "first", IssuedAt: now.Add(-time.Hour)})
	_ = store.Save(Identity{ID: "b", AgentName: "second", IssuedAt: now})
	xs, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 2 {
		t.Fatalf("len = %d, want 2", len(xs))
	}
	if xs[0].AgentName != "second" {
		t.Errorf("first item = %q, want second (most-recent first)", xs[0].AgentName)
	}
}
