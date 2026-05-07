package pgproxy

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"
	"time"

	"github.com/costaxanthos/vigil/proxy/internal/audit"
)

// BenchmarkAuditCanonicalForm measures the canonical-form construction
// that runs once per parsed Postgres message inside the pump goroutine.
// CanonicalForm + SHA-256 over query text is the deterministic part of
// the audit hot path; signing and SQLite INSERT happen behind it.
//
// Acceptance #6: added latency p50 < 1ms, p99 < 5ms vs direct connection.
// On a 2024 M-series Mac this benchmark runs sub-microsecond per op,
// well under the 1ms budget. The remaining latency comes from Ed25519
// signing (BenchmarkAuditSign below) and the SQLite INSERT, which
// is covered end-to-end by TestThousandQueryAuditSigning in audit_test.go.
func BenchmarkAuditCanonicalForm(b *testing.B) {
	const queryText = "SELECT id, name, created_at FROM users WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50"
	const agentID = "agent_01HXYZ1234567890"
	const connID = "11111111-2222-3333-4444-555555555555"
	ts := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = audit.CanonicalForm(agentID, connID, ts, "Query", queryText)
	}
}

// BenchmarkAuditSign measures the full hot path on the pump goroutine —
// canonical form + Ed25519 sign + base64 encode. This is the work the
// pump does before either a synchronous DBWriter.Write or an async
// channel send to the audit goroutine.
func BenchmarkAuditSign(b *testing.B) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		b.Fatal(err)
	}
	_ = pub
	signer := &audit.Ed25519Signer{Key: priv}

	const queryText = "SELECT id, name, created_at FROM users WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50"
	const agentID = "agent_01HXYZ1234567890"
	const connID = "11111111-2222-3333-4444-555555555555"
	ts := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		canonical := audit.CanonicalForm(agentID, connID, ts, "Query", queryText)
		_ = base64.RawStdEncoding.EncodeToString(signer.SignRaw([]byte(canonical)))
	}
}
