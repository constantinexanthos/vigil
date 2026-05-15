// Package vigil is the Go helper for the Vigil agent-aware proxy.
//
// When a Go program connects to Postgres through vigil-proxy, the proxy
// extracts an identity token from `application_name=vigil:<token>` in
// the connection startup packet. This helper attaches that token to a
// pgx connection (or a DSN string) so the proxy can see who's talking.
//
// Usage with pgx:
//
//	import (
//	    "github.com/jackc/pgx/v5"
//	    "github.com/costaxanthos/vigil/clients/go/vigil"
//	)
//
//	cfg, err := pgx.ParseConfig(os.Getenv("DATABASE_URL"))
//	if err != nil { panic(err) }
//	cfg = vigil.WrapPgxConfig(cfg)
//	conn, err := pgx.ConnectConfig(ctx, cfg)
//
// Usage with bare DSN:
//
//	dsn := vigil.WrapDSN(os.Getenv("DATABASE_URL"))
//	// pass dsn to whatever pg client you use
//
// Both APIs are no-ops when VIGIL_TOKEN is not set in the environment,
// so a binary built with the helper can run unchanged outside the
// proxy (in CI, on a developer's laptop without vigil-run, etc.).
//
// If user code already set application_name (e.g.
// "application_name=my-app"), the helper appends the Vigil token after
// a `:` separator. Both segments survive into the audit feed.
package vigil

import (
	"net/url"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
)

// envVar is the environment variable vigil-run (and any equivalent
// shell setup) is expected to populate. Exported as a constant so
// test code can rebind it without string-matching.
const envVar = "VIGIL_TOKEN"

// appNameKey is the Postgres startup-parameter key both wrappers
// modify. Kept here so a future rename (e.g. "vigil_application_name")
// only touches one spot.
const appNameKey = "application_name"

// WrapPgxConfig returns the pgx config with the Vigil token appended to
// its application_name. If VIGIL_TOKEN is not set, cfg is returned
// unchanged.
//
// If cfg.RuntimeParams already contains application_name (the user
// pre-set it for, say, query-log grouping), the existing value is
// preserved and the Vigil token is appended: `my-app:vigil:<token>`.
// The pgproxy parses the FIRST `vigil:` prefix it finds, so colon
// chaining is safe.
func WrapPgxConfig(cfg *pgx.ConnConfig) *pgx.ConnConfig {
	if cfg == nil {
		return nil
	}
	token := os.Getenv(envVar)
	if token == "" {
		return cfg
	}
	if cfg.RuntimeParams == nil {
		cfg.RuntimeParams = map[string]string{}
	}
	if existing := cfg.RuntimeParams[appNameKey]; existing != "" {
		cfg.RuntimeParams[appNameKey] = existing + ":vigil:" + token
	} else {
		cfg.RuntimeParams[appNameKey] = "vigil:" + token
	}
	return cfg
}

// WrapDSN returns the DSN with application_name set so vigil-proxy
// can attach the calling identity. Returns the input unchanged when
// VIGIL_TOKEN is not set.
//
// The function accepts both DSN forms:
//
//	URL form:        postgres://user:pass@host:5432/dbname?sslmode=disable
//	libpq key=value: "host=localhost port=5432 user=app dbname=app"
//
// The URL form is handled by URL parsing; libpq form by string editing.
// A user-supplied application_name is preserved with `:`-chaining.
func WrapDSN(dsn string) string {
	token := os.Getenv(envVar)
	if token == "" || dsn == "" {
		return dsn
	}
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		return wrapURLDSN(dsn, token)
	}
	return wrapKeyValueDSN(dsn, token)
}

// wrapURLDSN edits the application_name query parameter on a URL-style
// DSN. We url.Parse + url.Encode so user-supplied values with `&`, `=`,
// spaces, etc. round-trip cleanly.
func wrapURLDSN(dsn, token string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		// Malformed DSN — return as-is rather than guess. The
		// downstream pg client will surface a clearer error.
		return dsn
	}
	q := u.Query()
	if existing := q.Get(appNameKey); existing != "" {
		q.Set(appNameKey, existing+":vigil:"+token)
	} else {
		q.Set(appNameKey, "vigil:"+token)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// wrapKeyValueDSN handles libpq-style "key=value key=value" DSNs.
// We walk the existing tokens and either replace or append.
//
// Values containing spaces aren't quoted by anyone we've seen call
// this in practice; vigil tokens are URL-safe base64, so we don't
// emit quotes either. If you do need quoting, use the URL form.
func wrapKeyValueDSN(dsn, token string) string {
	parts := strings.Fields(dsn)
	replaced := false
	for i, p := range parts {
		if strings.HasPrefix(p, appNameKey+"=") {
			existing := strings.TrimPrefix(p, appNameKey+"=")
			parts[i] = appNameKey + "=" + existing + ":vigil:" + token
			replaced = true
			break
		}
	}
	if !replaced {
		parts = append(parts, appNameKey+"=vigil:"+token)
	}
	return strings.Join(parts, " ")
}

// Token returns the current VIGIL_TOKEN env value, or "" if unset.
// Provided so callers building their own connection layer can check
// the active identity without rolling another os.Getenv call.
func Token() string {
	return os.Getenv(envVar)
}
