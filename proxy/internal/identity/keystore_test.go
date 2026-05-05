package identity

import (
	"os"
	"path/filepath"
	"testing"
)

// LoadOrCreateIssuer should generate and persist a fresh keypair when the
// path is empty. The on-disk file must be exactly 64 bytes (Ed25519 private
// key seed+public per stdlib) and have file mode 0600 — anything looser
// leaks the issuer's signing identity.
func TestLoadOrCreateIssuerCreatesNewKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.key")

	iss, err := LoadOrCreateIssuer(path)
	if err != nil {
		t.Fatalf("LoadOrCreateIssuer: %v", err)
	}
	if iss == nil {
		t.Fatal("expected Issuer, got nil")
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("key file not written: %v", err)
	}
	if info.Size() != 64 {
		t.Errorf("key size = %d, want 64", info.Size())
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("key mode = %v, want 0600", info.Mode().Perm())
	}
}

// On a second call, LoadOrCreateIssuer must return an Issuer with the SAME
// signing key — the whole point is that previously issued tokens stay
// verifiable across restarts.
func TestLoadOrCreateIssuerLoadsExistingKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.key")

	first, err := LoadOrCreateIssuer(path)
	if err != nil {
		t.Fatalf("first LoadOrCreateIssuer: %v", err)
	}
	_, tok, err := first.Issue(IssueRequest{AgentName: "claude", Principal: "p"})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	second, err := LoadOrCreateIssuer(path)
	if err != nil {
		t.Fatalf("second LoadOrCreateIssuer: %v", err)
	}
	// Same key → second can verify first's token.
	if _, err := second.Verify(tok.Token); err != nil {
		t.Fatalf("token from first should verify on second restart: %v", err)
	}
	if first.PublicKeyB64() != second.PublicKeyB64() {
		t.Errorf("public keys differ across loads: %q vs %q", first.PublicKeyB64(), second.PublicKeyB64())
	}
}

// Empty key file: corruption, partially-truncated write, or a placeholder
// the operator dropped in. Don't silently regenerate — the operator might
// have meant to provision a real one. Fail loud.
func TestLoadOrCreateIssuerRejectsEmptyKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.key")
	if err := os.WriteFile(path, []byte{}, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreateIssuer(path); err == nil {
		t.Fatal("expected error for empty key file, got nil")
	}
}

// Wrong-size file: someone wrote a public key, an SSH key, random bytes —
// any of which would parse-fail at sign time. Catch it at load time.
func TestLoadOrCreateIssuerRejectsCorruptKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.key")
	if err := os.WriteFile(path, []byte("not a real ed25519 private key"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreateIssuer(path); err == nil {
		t.Fatal("expected error for corrupt key file, got nil")
	}
}

// Creating the file in a directory that doesn't exist yet should bubble up
// a clear error rather than panicking.
func TestLoadOrCreateIssuerNoSilentMkdir(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "does-not-exist", "proxy.key")
	if _, err := LoadOrCreateIssuer(path); err == nil {
		t.Fatal("expected error when parent dir missing, got nil")
	}
}
