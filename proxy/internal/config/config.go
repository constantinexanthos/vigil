package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Addr    string
	DBPath  string
	KeyPath string
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
	version := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *version {
		fmt.Println("vigil-proxy v0.0.2")
		os.Exit(0)
	}

	c.Addr = *addr
	c.DBPath = *db
	c.KeyPath = *key
	return c, nil
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
