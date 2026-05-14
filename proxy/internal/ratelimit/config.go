package ratelimit

import (
	"bytes"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// yamlConfig is the on-disk shape of --ratelimit-config. Strict
// decoding (KnownFields) rejects unknown keys so a typo at the top
// level fails loud rather than silently doing nothing.
//
// Schema (minimal — three top-level keys):
//
//	pools:
//	  production: { burst: 1000, refill: 500 }
//	  agents:     { burst: 100,  refill: 50 }
//	  unauth:     { burst: 10,   refill: 5 }
//
//	agents:
//	  ag_3J9XX: { pool: production }
//	  ag_AB2YY: { burst: 200, refill: 100 }
//
// Operators may omit any top-level key, any pool, or any agent
// override; the merged-in defaults from DefaultConfig() fill the gap.
type yamlConfig struct {
	Pools  map[string]yamlPool          `yaml:"pools"`
	Agents map[string]yamlAgentOverride `yaml:"agents"`
}

type yamlPool struct {
	Burst  float64 `yaml:"burst"`
	Refill float64 `yaml:"refill"`
}

type yamlAgentOverride struct {
	Pool   string  `yaml:"pool"`
	Burst  float64 `yaml:"burst"`
	Refill float64 `yaml:"refill"`
}

// LoadConfig reads the YAML config at path and returns a Config
// merged on top of DefaultConfig. Any pool the user explicitly sets
// replaces the default; pools the user omits keep their default
// values. Per-agent overrides are stored verbatim.
//
// LoadConfig fails loud on:
//   - missing file
//   - unreadable file
//   - malformed YAML
//   - unknown top-level keys (KnownFields strict mode)
//   - non-positive burst on a configured pool (a 0-burst pool is
//     useless and the operator almost certainly meant the default)
//
// Negative refill is also rejected; zero refill is allowed (a
// one-shot bucket has legitimate test uses but no production use, and
// the spec keeps the door open).
func LoadConfig(path string) (Config, error) {
	if path == "" {
		return Config{}, fmt.Errorf("ratelimit: config path is required")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("ratelimit: read %s: %w", path, err)
	}

	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	var raw yamlConfig
	if err := dec.Decode(&raw); err != nil {
		return Config{}, fmt.Errorf("ratelimit: parse %s: %w", path, err)
	}

	cfg := DefaultConfig()

	for name, pool := range raw.Pools {
		if name == "" {
			return Config{}, fmt.Errorf("ratelimit: %s: pool name is empty", path)
		}
		if pool.Burst <= 0 {
			return Config{}, fmt.Errorf("ratelimit: %s: pool %q: burst must be > 0 (got %v)", path, name, pool.Burst)
		}
		if pool.Refill < 0 {
			return Config{}, fmt.Errorf("ratelimit: %s: pool %q: refill must be >= 0 (got %v)", path, name, pool.Refill)
		}
		cfg.Pools[name] = PoolConfig{
			Burst:        pool.Burst,
			RefillPerSec: pool.Refill,
		}
	}

	for agentID, override := range raw.Agents {
		if agentID == "" {
			return Config{}, fmt.Errorf("ratelimit: %s: agent ID is empty", path)
		}
		if override.Burst < 0 {
			return Config{}, fmt.Errorf("ratelimit: %s: agent %q: burst must be >= 0 (got %v)", path, agentID, override.Burst)
		}
		if override.Refill < 0 {
			return Config{}, fmt.Errorf("ratelimit: %s: agent %q: refill must be >= 0 (got %v)", path, agentID, override.Refill)
		}
		cfg.Agents[agentID] = AgentOverride{
			Pool:         override.Pool,
			Burst:        override.Burst,
			RefillPerSec: override.Refill,
		}
	}

	return cfg, nil
}
