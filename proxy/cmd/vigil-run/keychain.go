// Package main: keychain helpers for vigil-run.
//
// Tokens minted from vigil-proxy's /identities endpoint are cached so a
// second `vigil-run claude` call on the same machine reuses the existing
// identity instead of registering a fresh one every invocation. Cache
// keys are scoped by principal+agent so multiple humans on a shared
// workstation don't collide, and so the same human running `vigil-run
// claude` and `vigil-run codex` get distinct identities.
//
// Backend selection order (first that works wins):
//
//  1. github.com/zalando/go-keyring — wraps macOS Keychain, Linux
//     libsecret/gnome-keyring/kwallet, Windows Credential Manager.
//  2. ~/.config/vigil/token-<principal>-<agent> file, mode 0600 —
//     plain-text fallback for headless Linux (no libsecret) and any
//     CI/container environment where a real keychain isn't running.
//  3. In-memory only — the wrapper warns once and the cache lives
//     for the lifetime of this process only (which is short — exec
//     replaces it).
//
// The lead's guidance was explicit: don't sink days into platform-
// specific keychain quirks. The contract is "tokens persist across
// vigil-run invocations on the same user's machine"; file-fallback
// satisfies that.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/zalando/go-keyring"
)

// cachedToken is the structure persisted in the keychain or fallback
// file. Storing more than just the token string lets us check
// expiration before reuse — a token that expires in 30 minutes is no
// good for a `vigil-run claude` session that's about to run all
// afternoon.
type cachedToken struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// keychainService is the constant service name go-keyring uses to scope
// our entries inside the OS keychain. Multiple tokens distinguish
// themselves via the per-key account name.
const keychainService = "vigil-run"

// cacheKey produces the keychain account name (and fallback filename
// suffix) for a given principal+agent pair. The format is intentionally
// human-readable so users curious about what vigil-run stored on their
// machine can find it.
func cacheKey(principal, agentName string) string {
	if principal == "" {
		principal = "default"
	}
	if agentName == "" {
		agentName = "default"
	}
	return principal + ":" + agentName
}

// tokenStore is the interface keychain.go exports to main.go. Tests
// substitute a stub so we don't write to the real Keychain when go
// test runs in CI.
type tokenStore interface {
	get(principal, agentName string) (cachedToken, bool, error)
	set(principal, agentName string, t cachedToken) error
	delete(principal, agentName string) error
}

// realStore is the production tokenStore: keychain first, file
// fallback second, in-memory map third. It's stateless except for the
// memory map (used only when both keychain and file fail).
type realStore struct {
	// memOnly is set when both keychain.Set and the file fallback
	// have failed at least once; we warn once and route all subsequent
	// reads/writes through memCache.
	memOnly  bool
	memCache map[string]cachedToken

	// configDir overrides the fallback file directory. Set
	// automatically from VIGIL_RUN_CACHE_DIR for tests/CI; empty in
	// production falls through to ~/.config/vigil.
	configDir string

	// skipKeychain forces the file fallback regardless of whether
	// the OS keychain is reachable. Set automatically from
	// VIGIL_RUN_SKIP_KEYCHAIN=1 for tests and headless CI where
	// libsecret may be present-but-broken.
	skipKeychain bool
}

func newRealStore() *realStore {
	s := &realStore{memCache: map[string]cachedToken{}}
	if dir := os.Getenv("VIGIL_RUN_CACHE_DIR"); dir != "" {
		s.configDir = dir
	}
	if os.Getenv("VIGIL_RUN_SKIP_KEYCHAIN") == "1" {
		s.skipKeychain = true
	}
	return s
}

// get looks up a cached token. Returns (token, true, nil) on hit,
// (zero, false, nil) on miss, and (zero, false, err) only for
// genuinely unexpected errors (e.g. malformed cached JSON). Missing
// keychain entry or missing fallback file are both clean misses.
func (s *realStore) get(principal, agentName string) (cachedToken, bool, error) {
	key := cacheKey(principal, agentName)

	if s.memOnly {
		t, ok := s.memCache[key]
		return t, ok, nil
	}

	if !s.skipKeychain {
		// Try keychain first.
		raw, err := keyring.Get(keychainService, key)
		if err == nil {
			var t cachedToken
			if jerr := json.Unmarshal([]byte(raw), &t); jerr == nil {
				return t, true, nil
			}
			// Malformed cache row — treat as miss, fall through to file
			// in case the user manually edited their config dir.
		} else if !errors.Is(err, keyring.ErrNotFound) {
			// Real keychain error (libsecret unavailable, locked, etc).
			// Fall back to file; don't blow up the call.
		}
	}

	// File fallback.
	path, perr := s.fallbackPath(key)
	if perr != nil {
		return cachedToken{}, false, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cachedToken{}, false, nil
		}
		return cachedToken{}, false, fmt.Errorf("read token cache %s: %w", path, err)
	}
	var t cachedToken
	if err := json.Unmarshal(b, &t); err != nil {
		// Corrupt cache file — treat as miss and let set() rewrite it
		// on the next mint.
		return cachedToken{}, false, nil
	}
	return t, true, nil
}

// set persists a token. On keychain success we don't also write the
// file (avoids double-source-of-truth confusion). On keychain failure
// we try the file. On both failing, we route to memCache for the
// remainder of the process.
func (s *realStore) set(principal, agentName string, t cachedToken) error {
	key := cacheKey(principal, agentName)
	b, err := json.Marshal(t)
	if err != nil {
		return fmt.Errorf("marshal cached token: %w", err)
	}

	if s.memOnly {
		s.memCache[key] = t
		return nil
	}

	if !s.skipKeychain {
		if err := keyring.Set(keychainService, key, string(b)); err == nil {
			return nil
		}
	}

	// Keychain failed. Try file.
	path, perr := s.fallbackPath(key)
	if perr == nil {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err == nil {
			if err := os.WriteFile(path, b, 0o600); err == nil {
				return nil
			}
		}
	}

	// Memory-only from here on.
	s.memOnly = true
	s.memCache[key] = t
	fmt.Fprintln(os.Stderr,
		"vigil-run: warning — neither OS keychain nor ~/.config/vigil/ is writable; "+
			"token cached in-memory only and will not persist across invocations.")
	return nil
}

// delete removes a cached token for the given principal+agent. Used by
// --rotate to force a fresh mint on the next call after this one
// succeeds. Idempotent.
func (s *realStore) delete(principal, agentName string) error {
	key := cacheKey(principal, agentName)
	if s.memOnly {
		delete(s.memCache, key)
		return nil
	}
	// Best-effort across both backends; missing entries are not errors.
	if !s.skipKeychain {
		_ = keyring.Delete(keychainService, key)
	}
	if path, perr := s.fallbackPath(key); perr == nil {
		_ = os.Remove(path)
	}
	return nil
}

// fallbackPath returns the filesystem path used when the OS keychain is
// unavailable. It lives under ~/.config/vigil/ (mode 0700) so a stray
// `ls -la` reveals only the user's own tokens.
func (s *realStore) fallbackPath(key string) (string, error) {
	if s.configDir != "" {
		return filepath.Join(s.configDir, "token-"+sanitize(key)), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locate home dir: %w", err)
	}
	return filepath.Join(home, ".config", "vigil", "token-"+sanitize(key)), nil
}

// sanitize replaces characters that would be awkward in a filename
// (slashes, colons on Windows) with underscores. The key is
// principal:agent — colons are the common case.
func sanitize(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z',
			c >= 'A' && c <= 'Z',
			c >= '0' && c <= '9',
			c == '.', c == '-', c == '_', c == '@':
			out = append(out, c)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}
