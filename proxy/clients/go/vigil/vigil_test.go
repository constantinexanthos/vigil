package vigil

import (
	"net/url"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// TestWrapPgxConfig_TokenSet verifies the happy path: VIGIL_TOKEN set,
// application_name gets the vigil:<token> attached.
func TestWrapPgxConfig_TokenSet(t *testing.T) {
	t.Setenv(envVar, "test-token-abc")
	cfg, err := pgx.ParseConfig("postgres://app:secret@localhost:5432/mydb?sslmode=disable")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := WrapPgxConfig(cfg)
	if got == nil {
		t.Fatal("WrapPgxConfig returned nil")
	}
	app := got.RuntimeParams[appNameKey]
	if app != "vigil:test-token-abc" {
		t.Errorf("application_name = %q, want vigil:test-token-abc", app)
	}
}

// TestWrapPgxConfig_NoToken verifies the no-op contract — code that
// works in CI without VIGIL_TOKEN shouldn't suddenly add an
// application_name when the helper runs.
func TestWrapPgxConfig_NoToken(t *testing.T) {
	t.Setenv(envVar, "")
	cfg, err := pgx.ParseConfig("postgres://app:secret@localhost:5432/mydb")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	before := cfg.RuntimeParams[appNameKey]
	got := WrapPgxConfig(cfg)
	if got.RuntimeParams[appNameKey] != before {
		t.Errorf("application_name mutated without token: was %q, now %q",
			before, got.RuntimeParams[appNameKey])
	}
}

// TestWrapPgxConfig_PreservesExistingAppName covers the chaining case:
// user already set application_name; we append the Vigil bit.
func TestWrapPgxConfig_PreservesExistingAppName(t *testing.T) {
	t.Setenv(envVar, "test-token-xyz")
	cfg, err := pgx.ParseConfig("postgres://app:secret@localhost:5432/mydb?application_name=my-app")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := WrapPgxConfig(cfg)
	want := "my-app:vigil:test-token-xyz"
	if got.RuntimeParams[appNameKey] != want {
		t.Errorf("application_name = %q, want %q", got.RuntimeParams[appNameKey], want)
	}
}

// TestWrapPgxConfig_NilCfg verifies we don't blow up on a nil input.
// pgx returns nil from ParseConfig only on error, but defensive code
// in the helper costs nothing.
func TestWrapPgxConfig_NilCfg(t *testing.T) {
	t.Setenv(envVar, "tok")
	if got := WrapPgxConfig(nil); got != nil {
		t.Errorf("WrapPgxConfig(nil) = %v, want nil", got)
	}
}

// TestWrapDSN_URLForm covers the URL-style DSN.
func TestWrapDSN_URLForm(t *testing.T) {
	t.Setenv(envVar, "url-form-token")
	in := "postgres://app:secret@localhost:5432/mydb?sslmode=disable"
	out := WrapDSN(in)
	u, err := url.Parse(out)
	if err != nil {
		t.Fatalf("parse output: %v", err)
	}
	app := u.Query().Get(appNameKey)
	if app != "vigil:url-form-token" {
		t.Errorf("application_name = %q, want vigil:url-form-token", app)
	}
	// Other query params must survive.
	if u.Query().Get("sslmode") != "disable" {
		t.Errorf("sslmode lost: %q", u.Query().Get("sslmode"))
	}
}

// TestWrapDSN_URLForm_PreservesExistingAppName covers chaining on URL.
func TestWrapDSN_URLForm_PreservesExistingAppName(t *testing.T) {
	t.Setenv(envVar, "url-token")
	in := "postgres://app:secret@localhost:5432/mydb?application_name=my-bot&sslmode=disable"
	out := WrapDSN(in)
	u, _ := url.Parse(out)
	want := "my-bot:vigil:url-token"
	if u.Query().Get(appNameKey) != want {
		t.Errorf("application_name = %q, want %q", u.Query().Get(appNameKey), want)
	}
}

// TestWrapDSN_KeyValueForm covers the libpq key=value DSN.
func TestWrapDSN_KeyValueForm(t *testing.T) {
	t.Setenv(envVar, "kv-token")
	in := "host=localhost port=5432 user=app dbname=mydb"
	out := WrapDSN(in)
	if !strings.Contains(out, appNameKey+"=vigil:kv-token") {
		t.Errorf("output missing application_name=vigil:kv-token: %q", out)
	}
	// Other keys must survive.
	if !strings.Contains(out, "host=localhost") || !strings.Contains(out, "port=5432") {
		t.Errorf("other keys missing from output: %q", out)
	}
}

// TestWrapDSN_KeyValueForm_PreservesExistingAppName covers KV chaining.
func TestWrapDSN_KeyValueForm_PreservesExistingAppName(t *testing.T) {
	t.Setenv(envVar, "kv-token")
	in := "host=localhost user=app application_name=my-svc dbname=mydb"
	out := WrapDSN(in)
	if !strings.Contains(out, "application_name=my-svc:vigil:kv-token") {
		t.Errorf("output missing chained app name: %q", out)
	}
}

// TestWrapDSN_NoToken covers the no-op contract for both forms.
func TestWrapDSN_NoToken(t *testing.T) {
	t.Setenv(envVar, "")
	for _, in := range []string{
		"postgres://app:secret@localhost/mydb",
		"host=localhost dbname=mydb",
		"",
	} {
		if out := WrapDSN(in); out != in {
			t.Errorf("WrapDSN(%q) = %q without VIGIL_TOKEN; want unchanged", in, out)
		}
	}
}

// TestToken returns the env value.
func TestToken(t *testing.T) {
	t.Setenv(envVar, "my-tok")
	if got := Token(); got != "my-tok" {
		t.Errorf("Token() = %q, want my-tok", got)
	}
	t.Setenv(envVar, "")
	if got := Token(); got != "" {
		t.Errorf("Token() with unset env = %q, want empty", got)
	}
}
