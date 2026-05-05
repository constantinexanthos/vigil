package config

import (
	"flag"
	"fmt"
	"os"
)

type Config struct {
	Addr string
}

func Load() (*Config, error) {
	c := &Config{}

	addr := flag.String("addr", envOr("VIGIL_PROXY_ADDR", ":7878"), "HTTP listen address")
	version := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *version {
		fmt.Println("vigil-proxy v0.0.1")
		os.Exit(0)
	}

	c.Addr = *addr
	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
