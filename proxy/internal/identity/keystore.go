package identity

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
)

// LoadOrCreateIssuer returns an Issuer whose signing key is persisted at
// `path`. If the file exists, it must contain exactly an Ed25519 private
// key (64 bytes per stdlib layout: 32-byte seed + 32-byte public). If it
// doesn't exist, a fresh keypair is generated and written with mode 0600.
//
// The parent directory must already exist — we don't MkdirAll on purpose,
// so an operator who fat-fingers `--key /etc/typo/key` gets a clear error
// instead of a silently-misplaced key file.
//
// Persistence matters because every restart of an in-memory issuer
// invalidates every previously-issued token. With a stable key on disk,
// tokens stay verifiable across daemon restarts.
func LoadOrCreateIssuer(path string) (*Issuer, error) {
	if path == "" {
		return nil, errors.New("identity: keystore path is required")
	}

	data, err := os.ReadFile(path)
	if err == nil {
		if len(data) != ed25519.PrivateKeySize {
			return nil, fmt.Errorf(
				"identity: key file %s has size %d, want %d (corrupt or wrong file)",
				path, len(data), ed25519.PrivateKeySize,
			)
		}
		priv := ed25519.PrivateKey(data)
		pub, ok := priv.Public().(ed25519.PublicKey)
		if !ok {
			return nil, fmt.Errorf("identity: key file %s did not yield a public key", path)
		}
		return &Issuer{priv: priv, pub: pub}, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("identity: read key file %s: %w", path, err)
	}

	// Fresh generation path.
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("identity: generate keypair: %w", err)
	}
	if err := os.WriteFile(path, priv, 0o600); err != nil {
		return nil, fmt.Errorf("identity: write key file %s: %w", path, err)
	}
	return &Issuer{priv: priv, pub: pub}, nil
}
