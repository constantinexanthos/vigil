package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Addr    string
	DBPath  string
	KeyPath string

	// Postgres proxy settings (v0.1.0a). When PostgresListen is empty or
	// PostgresDisabled is true, the Postgres proxy is not started; the HTTP
	// identity server still runs.
	PostgresListen   string
	PostgresUpstream string
	PostgresDisabled bool
}

func Load() (*Config, error) {
	c := &Config{}

	defaultDB, defaultKey, err := defaultPaths()
	if err != nil {
		return nil, err
	}

	addr := flag.String("addr", envOr("VIGIL_PROXY_ADDR", ":7878"), "HTTP listen address")
	db := flag.String("db", envOr("VIGIL_PROXY_DB", defaultDB), "Path to the SQLite identity database (created on first start)")
	key := flag.String("key", envOr("VIGIL_PROXY_KEY", defaultKey), "Path to the Ed25519 issuer key (generated on first start)")

	pgListen := flag.String("postgres-listen", envOr("VIGIL_POSTGRES_LISTEN", ""), "Postgres proxy listen address (e.g. :7432). Empty disables the Postgres proxy.")
	pgUpstream := flag.String("postgres-upstream", envOr("VIGIL_POSTGRES_UPSTREAM", ""), "Real Postgres address to forward to (e.g. localhost:5432).")
	pgDisabled := flag.Bool("postgres-disabled", envBool("VIGIL_POSTGRES_DISABLED", false), "Disable the Postgres proxy even if --postgres-listen and --postgres-upstream are set.")

	version := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *version {
		fmt.Println("vigil-proxy v0.1.0b")
		os.Exit(0)
	}

	c.Addr = *addr
	c.DBPath = *db
	c.KeyPath = *key
	c.PostgresListen = *pgListen
	c.PostgresUpstream = *pgUpstream
	c.PostgresDisabled = *pgDisabled
	return c, nil
}

// PostgresProxyEnabled reports whether the Postgres proxy should start.
// True iff a listen address is set, an upstream address is set, and the
// disable flag is not on.
func (c *Config) PostgresProxyEnabled() bool {
	return c.PostgresListen != "" && c.PostgresUpstream != "" && !c.PostgresDisabled
}

// defaultPaths returns the standard ~/.vigil/{proxy.db,proxy.key} pair.
// They sit next to the daemon's vigil.db on purpose — operators only have
// one Vigil state directory to back up.
func defaultPaths() (string, string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", fmt.Errorf("config: locate home dir: %w", err)
	}
	dir := filepath.Join(home, ".vigil")
	return filepath.Join(dir, "proxy.db"), filepath.Join(dir, "proxy.key"), nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envBool parses an env var as a boolean. Accepts the values strconv.ParseBool
// understands (1/t/T/TRUE/true/True/0/f/F/FALSE/false/False); anything else
// (including empty) returns the fallback.
func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return parsed
}
