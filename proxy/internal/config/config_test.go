package config

import "testing"

func TestPostgresProxyEnabled(t *testing.T) {
	cases := []struct {
		name     string
		listen   string
		upstream string
		disabled bool
		want     bool
	}{
		{"both set, not disabled", ":7432", "localhost:5432", false, true},
		{"both set, disabled", ":7432", "localhost:5432", true, false},
		{"listen empty", "", "localhost:5432", false, false},
		{"upstream empty", ":7432", "", false, false},
		{"both empty", "", "", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := &Config{
				PostgresListen:   tc.listen,
				PostgresUpstream: tc.upstream,
				PostgresDisabled: tc.disabled,
			}
			if got := c.PostgresProxyEnabled(); got != tc.want {
				t.Errorf("PostgresProxyEnabled() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestEnvBool(t *testing.T) {
	cases := []struct {
		name     string
		key      string
		envVal   string
		setEnv   bool
		fallback bool
		want     bool
	}{
		{"unset uses fallback true", "TEST_BOOL_UNSET_T", "", false, true, true},
		{"unset uses fallback false", "TEST_BOOL_UNSET_F", "", false, false, false},
		{"true literal", "TEST_BOOL_TRUE", "true", true, false, true},
		{"1 literal", "TEST_BOOL_ONE", "1", true, false, true},
		{"false literal", "TEST_BOOL_FALSE", "false", true, true, false},
		{"junk falls back", "TEST_BOOL_JUNK", "yes please", true, true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.setEnv {
				t.Setenv(tc.key, tc.envVal)
			}
			if got := envBool(tc.key, tc.fallback); got != tc.want {
				t.Errorf("envBool(%q, %v) = %v, want %v", tc.key, tc.fallback, got, tc.want)
			}
		})
	}
}
