// Package identity issues, stores, and verifies agent identities.
//
// An agent identity is a signed token that a downstream component (the proxy,
// an MCP server, an audit logger) can use to attribute a request to a
// specific agent acting on behalf of a specific human principal.
//
// v0.0.1 keeps state in-memory. Persistence ships in v0.0.2.
package identity

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Identity represents an issued agent identity.
type Identity struct {
	ID        string    `json:"id"`
	AgentName string    `json:"agent_name"`
	Principal string    `json:"principal"`
	Scopes    []string  `json:"scopes"`
	PublicKey string    `json:"public_key"`
	IssuedAt  time.Time `json:"issued_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// IssueRequest is the input to Issue.
type IssueRequest struct {
	AgentName string   `json:"agent_name"`
	Principal string   `json:"principal"`
	Scopes    []string `json:"scopes"`
	TTL       string   `json:"ttl,omitempty"` // optional, defaults to 24h
}

// Token is a signed bearer token for an Identity.
type Token struct {
	ID        string `json:"id"`
	Token     string `json:"token"`     // base64(payload).base64(signature)
	PublicKey string `json:"publicKey"` // base64(public key) — clients use this to verify
}

// Issuer creates and verifies tokens. It owns the signing key.
type Issuer struct {
	priv ed25519.PrivateKey
	pub  ed25519.PublicKey
}

// NewIssuer generates a fresh Ed25519 keypair and returns an Issuer.
func NewIssuer() (*Issuer, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("identity: generate keypair: %w", err)
	}
	return &Issuer{priv: priv, pub: pub}, nil
}

// Issue creates a new Identity and a signed Token for it.
func (s *Issuer) Issue(req IssueRequest) (Identity, Token, error) {
	if req.AgentName == "" {
		return Identity{}, Token{}, errors.New("identity: agent_name is required")
	}
	if req.Principal == "" {
		return Identity{}, Token{}, errors.New("identity: principal is required")
	}

	ttl := 24 * time.Hour
	if req.TTL != "" {
		d, err := time.ParseDuration(req.TTL)
		if err != nil {
			return Identity{}, Token{}, fmt.Errorf("identity: parse ttl: %w", err)
		}
		ttl = d
	}

	id, err := randomID()
	if err != nil {
		return Identity{}, Token{}, err
	}

	now := time.Now().UTC()
	identity := Identity{
		ID:        id,
		AgentName: req.AgentName,
		Principal: req.Principal,
		Scopes:    req.Scopes,
		PublicKey: base64.RawStdEncoding.EncodeToString(s.pub),
		IssuedAt:  now,
		ExpiresAt: now.Add(ttl),
	}

	token, err := s.sign(identity)
	if err != nil {
		return Identity{}, Token{}, err
	}

	return identity, token, nil
}

func (s *Issuer) sign(id Identity) (Token, error) {
	payload, err := json.Marshal(id)
	if err != nil {
		return Token{}, fmt.Errorf("identity: marshal payload: %w", err)
	}
	sig := ed25519.Sign(s.priv, payload)
	tok := base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
	return Token{
		ID:        id.ID,
		Token:     tok,
		PublicKey: base64.RawStdEncoding.EncodeToString(s.pub),
	}, nil
}

// Verify checks a signed token against the issuer's public key. On success it
// returns the embedded Identity. The caller is responsible for checking
// expiration and scope.
func (s *Issuer) Verify(rawToken string) (Identity, error) {
	parts := splitOnce(rawToken, '.')
	if len(parts) != 2 {
		return Identity{}, errors.New("identity: malformed token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Identity{}, fmt.Errorf("identity: decode payload: %w", err)
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Identity{}, fmt.Errorf("identity: decode signature: %w", err)
	}
	if !ed25519.Verify(s.pub, payload, sig) {
		return Identity{}, errors.New("identity: invalid signature")
	}
	var id Identity
	if err := json.Unmarshal(payload, &id); err != nil {
		return Identity{}, fmt.Errorf("identity: unmarshal payload: %w", err)
	}
	return id, nil
}

// PublicKeyB64 returns the issuer's public key as base64. Useful for clients
// that want to verify tokens without calling Verify.
func (s *Issuer) PublicKeyB64() string {
	return base64.RawStdEncoding.EncodeToString(s.pub)
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("identity: random id: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func splitOnce(s string, sep byte) []string {
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			return []string{s[:i], s[i+1:]}
		}
	}
	return []string{s}
}
