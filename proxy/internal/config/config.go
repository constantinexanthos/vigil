package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// Version is overridden at build time via -ldflags="-X
// github.com/costaxanthos/vigil/proxy/internal/config.Version=<value>".
// Default value reflects the in-tree code release; the Makefile
// release target replaces it with the tag from `git describe`.
var Version = "v0.1.0c-dev"

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

	// Rate-limit config (v0.1.0c). When empty, the rate limiter runs with
	// DefaultConfig values: production=1000/500, agents=100/50, unauth=10/5.
	// When set, the YAML at this path is loaded at startup; malformed YAML
	// or unknown keys cause vigil-proxy to fail loud with os.Exit(1) rather
	// than silently falling back to defaults.
	RateLimitConfigPath string

	// Coalesce settings (v0.1.0d). TTL is the per-entry lifetime in the
	// per-agent query cache. Default 250ms; tuned in the design doc.
	CoalesceTTL time.Duration

	// MCPStdio enables the MCP server on stdio (for ~/.claude/mcp.json
	// installs). When set, the binary runs as an MCP stdio server and
	// SKIPS the HTTP and Postgres listeners — the MCP host expects
	// JSON-RPC on stdout, so any stray HTTP log line would corrupt the
	// wire format. The two modes are mutually exclusive by design.
	MCPStdio bool

	// DebugDetection enables verbose logging from the Tier-1 process
	// detector (proxy/internal/processdetect). Every connection
	// emits one line describing the resolved process chain,
	// matched agent name, and confidence — useful for tuning the
	// signature map against real harnesses on the operator's
	// machine. Off by default; the detector itself runs
	// unconditionally (when the Postgres proxy is enabled).
	DebugDetection bool
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

	rlConfig := flag.String("ratelimit-config", envOr("VIGIL_RATELIMIT_CONFIG", ""), "Path to a YAML rate-limit config (overrides built-in defaults). Empty uses defaults.")
	coalesceTTL := flag.Duration("coalesce-ttl", envDuration("VIGIL_COALESCE_TTL", 250*time.Millisecond), "Per-entry TTL for the fan-out coalescing cache. Default 250ms.")

	mcpStdio := flag.Bool("mcp-stdio", envBool("VIGIL_MCP_STDIO", false), "Run as an MCP stdio server (skips HTTP/Postgres listeners; logs go to stderr).")

	debugDetection := flag.Bool("debug-detection", envBool("VIGIL_DEBUG_DETECTION", false), "Log every Tier-1 process-detection attempt (chain, agent, confidence) for tuning the signature map.")

	version := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("vigil-proxy %s\n", Version)
		os.Exit(0)
	}

	c.Addr = *addr
	c.DBPath = *db
	c.KeyPath = *key
	c.PostgresListen = *pgListen
	c.PostgresUpstream = *pgUpstream
	c.PostgresDisabled = *pgDisabled
	c.RateLimitConfigPath = *rlConfig
	c.CoalesceTTL = *coalesceTTL
	c.MCPStdio = *mcpStdio
	c.DebugDetection = *debugDetection
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

// envDuration parses an env var as a time.Duration (e.g. "250ms", "2s",
// "1h30m"). Returns fallback for empty / unparseable values.
func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return parsed
}
