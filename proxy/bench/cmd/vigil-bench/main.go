// vigil-bench drives the coalescing benchmark harness end-to-end.
//
//	vigil-bench [--preset=refactor|mixed|production] [--duration=30s]
//	            [--concurrency=4] [--seed=42] [--out-dir=./bench]
//
// Output: writes RESULTS.md and results.json under --out-dir.
//
// See proxy/bench/README.md for the architecture and how to add a new
// preset.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/costaxanthos/vigil/proxy/bench/internal/results"
	"github.com/costaxanthos/vigil/proxy/bench/internal/runner"
)

const allPresetsValue = "all"

func main() {
	if err := run(); err != nil {
		log.Fatalf("vigil-bench: %v", err)
	}
}

func run() error {
	preset := flag.String("preset", envOr("BENCH_PRESET", allPresetsValue), "workload preset: refactor, mixed, production, or all")
	// Default 5s per arm × 3 presets × 2 arms = 30s of measurement, plus
	// ~5s overhead per preset for Docker/proxy spin-up = ~45s wall time
	// for `make bench`. Sits comfortably under the spec's <60s bar.
	// Override to 30s for publication-quality numbers.
	durationStr := flag.String("duration", envOr("BENCH_DURATION", "5s"), "per-arm wall-clock duration")
	concurrency := flag.Int("concurrency", envOrInt("BENCH_CONCURRENCY", 4), "client connection count per arm")
	seed := flag.Int64("seed", envOrInt64("BENCH_SEED", 42), "PRNG seed for determinism")
	outDir := flag.String("out-dir", envOr("BENCH_OUT_DIR", "proxy/bench"), "where to write RESULTS.md and results.json")
	repoRoot := flag.String("repo-root", envOr("BENCH_REPO_ROOT", findRepoRoot()), "vigil repo root, used to build vigil-proxy")
	flag.Parse()

	dur, err := time.ParseDuration(*durationStr)
	if err != nil {
		return fmt.Errorf("--duration: %w", err)
	}

	presets := []string{*preset}
	if *preset == allPresetsValue {
		presets = []string{"refactor", "mixed", "production"}
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	allRuns := make([]results.RunResult, 0, len(presets))
	for _, p := range presets {
		log.Printf("running preset %q for %s with concurrency=%d seed=%d", p, dur, *concurrency, *seed)
		r, err := runner.Run(ctx, runner.Config{
			Preset:      p,
			Seed:        *seed,
			Duration:    dur,
			Concurrency: *concurrency,
			RepoRoot:    *repoRoot,
		})
		if err != nil {
			return fmt.Errorf("preset %q: %w", p, err)
		}
		allRuns = append(allRuns, r)
		log.Printf("  done: issued=%d upstream=%d dedup=%.2f%% direct.p50=%s proxy.p50=%s",
			r.TotalIssued, r.TotalUpstream,
			results.DedupRate(r.TotalIssued, r.TotalUpstream)*100,
			r.Direct.P50, r.Proxy.P50,
		)
	}

	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", *outDir, err)
	}
	if err := writeJSON(filepath.Join(*outDir, "results.json"), allRuns); err != nil {
		return fmt.Errorf("write json: %w", err)
	}
	if err := writeMarkdown(filepath.Join(*outDir, "RESULTS.md"), allRuns, *seed); err != nil {
		return fmt.Errorf("write markdown: %w", err)
	}
	log.Printf("results written to %s", *outDir)
	return nil
}

func writeJSON(path string, runs []results.RunResult) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(runs)
}

func writeMarkdown(path string, runs []results.RunResult, seed int64) error {
	var b strings.Builder
	b.WriteString("# Vigil bench — RESULTS\n\n")
	b.WriteString(fmt.Sprintf("Generated %s · seed=%d · runtime=%s/%s\n\n",
		time.Now().UTC().Format(time.RFC3339),
		seed,
		runtime.GOOS, runtime.GOARCH,
	))
	b.WriteString("> v0.1.0d coalescing: per-agent query result cache, 250ms TTL. The refactor\n")
	b.WriteString("> preset models an AI coding agent re-fetching the same handful of records;\n")
	b.WriteString("> dedup rate is what the website's \"40-80% cost reduction\" claim quantifies.\n")
	b.WriteString("> Production preset's low dedup rate is by design — human-shaped traffic\n")
	b.WriteString("> against a wide key universe runs untouched.\n\n")

	for i, r := range runs {
		b.WriteString(r.Markdown())
		if i != len(runs)-1 {
			b.WriteString("\n---\n\n")
		}
	}
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

// findRepoRoot walks up from CWD looking for the proxy/ directory so the
// runner's `go build ./cmd/vigil-proxy` finds the source. Falls back to
// CWD if nothing matches — caller can override with --repo-root.
func findRepoRoot() string {
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	for d := wd; d != "/" && d != ""; d = filepath.Dir(d) {
		if _, err := os.Stat(filepath.Join(d, "proxy", "go.mod")); err == nil {
			return d
		}
	}
	return wd
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envOrInt64(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}
