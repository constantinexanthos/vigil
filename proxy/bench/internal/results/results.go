// Package results aggregates per-query latency samples into the
// headline numbers RESULTS.md publishes (p50/p95/p99, throughput,
// dedup rate) and emits both Markdown and JSON.
package results

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// PercentilesResult is the latency summary for one arm.
type PercentilesResult struct {
	P50 time.Duration `json:"p50_ns"`
	P95 time.Duration `json:"p95_ns"`
	P99 time.Duration `json:"p99_ns"`
}

// ArmResult is the per-arm summary the bench publishes — direct and
// through-proxy each have one of these. Throughput is queries per second
// over the active wall-clock duration.
type ArmResult struct {
	P50        time.Duration `json:"p50_ns"`
	P95        time.Duration `json:"p95_ns"`
	P99        time.Duration `json:"p99_ns"`
	Throughput float64       `json:"throughput_qps"`
	// Errors is queries that failed (connection error, query error,
	// timeout). Reported separately so a high failure rate doesn't
	// quietly inflate "fast" latencies.
	Errors int `json:"errors"`
}

// RunResult is one preset's complete measurement. The two arms plus
// dedup-rate context. Marshalable to JSON for results.json and
// formattable as a Markdown row for RESULTS.md.
type RunResult struct {
	// Config snapshot — what was measured.
	Preset      string        `json:"preset"`
	Seed        int64         `json:"seed"`
	Duration    time.Duration `json:"duration_ns"`
	Concurrency int           `json:"concurrency"`
	PostgresVer string        `json:"postgres_version,omitempty"`
	Hardware    string        `json:"hardware,omitempty"`

	// Volume — same workload runs in both arms, but issued/upstream
	// counts come from the proxy arm because that's where dedup is
	// observable.
	TotalIssued   int `json:"total_issued"`
	TotalUpstream int `json:"total_upstream"`

	// Per-arm latency + throughput.
	Direct ArmResult `json:"direct"`
	Proxy  ArmResult `json:"proxy"`

	// Wall time end-to-end, both arms combined. RESULTS.md surfaces
	// this so re-runners know how long to budget.
	WallTime time.Duration `json:"wall_time_ns"`
}

// Percentiles computes p50/p95/p99 from an unsorted slice of
// durations. Returns zero values for an empty slice — the formatter
// has to render something stable when an arm captured no samples.
func Percentiles(xs []time.Duration) PercentilesResult {
	if len(xs) == 0 {
		return PercentilesResult{}
	}
	sorted := make([]time.Duration, len(xs))
	copy(sorted, xs)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	return PercentilesResult{
		P50: pickPercentile(sorted, 0.50),
		P95: pickPercentile(sorted, 0.95),
		P99: pickPercentile(sorted, 0.99),
	}
}

// pickPercentile uses the "nearest-rank" definition: for sorted N samples,
// the pth percentile is the sample at index ceil(p * N) - 1. Common,
// simple, matches what most ops dashboards do.
//
// E.g. for N=100 sorted 1..100ms:
//   ceil(0.50*100)-1 = 49 → samples[49] = 50ms
//   ceil(0.95*100)-1 = 94 → samples[94] = 95ms
//   ceil(0.99*100)-1 = 98 → samples[98] = 99ms
func pickPercentile(sorted []time.Duration, p float64) time.Duration {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	idx := int(math.Ceil(p*float64(n))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= n {
		idx = n - 1
	}
	return sorted[idx]
}

// DedupRate is the headline number: 1 - upstream/issued. Returns 0 when
// issued is 0 (avoid NaN propagating into JSON / Markdown).
func DedupRate(issued, upstream int) float64 {
	if issued == 0 {
		return 0
	}
	return 1.0 - float64(upstream)/float64(issued)
}

// MarshalJSON emits a stable JSON shape. The dedup_rate field is
// computed at marshal time so both consumers (results.json and the
// website) see the same arithmetic.
func (r RunResult) MarshalJSON() ([]byte, error) {
	type alias RunResult
	wrapped := struct {
		alias
		DedupRate float64 `json:"dedup_rate"`
	}{
		alias:     alias(r),
		DedupRate: DedupRate(r.TotalIssued, r.TotalUpstream),
	}
	return json.Marshal(wrapped)
}

// Markdown formats one RunResult as a publishable section. The format
// is intentionally copy-paste-into-the-website friendly: a single table
// with the config, then a table with the two arms side by side.
func (r RunResult) Markdown() string {
	var b strings.Builder
	fmt.Fprintf(&b, "### Preset: %s\n\n", r.Preset)
	fmt.Fprintf(&b, "**Config**\n\n")
	fmt.Fprintf(&b, "| | |\n|---|---|\n")
	fmt.Fprintf(&b, "| Seed | %d |\n", r.Seed)
	fmt.Fprintf(&b, "| Duration | %s |\n", r.Duration)
	fmt.Fprintf(&b, "| Concurrency | %d |\n", r.Concurrency)
	if r.PostgresVer != "" {
		fmt.Fprintf(&b, "| Postgres | %s |\n", r.PostgresVer)
	}
	if r.Hardware != "" {
		fmt.Fprintf(&b, "| Hardware | %s |\n", r.Hardware)
	}
	fmt.Fprintf(&b, "| Wall time | %s |\n", r.WallTime.Round(time.Millisecond))

	fmt.Fprintf(&b, "\n**Volume & dedup**\n\n")
	fmt.Fprintf(&b, "| | |\n|---|---|\n")
	fmt.Fprintf(&b, "| Total queries issued | %d |\n", r.TotalIssued)
	fmt.Fprintf(&b, "| Queries hitting upstream | %d |\n", r.TotalUpstream)
	fmt.Fprintf(&b, "| Dedup rate | %.2f%% |\n", DedupRate(r.TotalIssued, r.TotalUpstream)*100)

	fmt.Fprintf(&b, "\n**Latency**\n\n")
	fmt.Fprintf(&b, "| Arm | p50 | p95 | p99 | Throughput | Errors |\n")
	fmt.Fprintf(&b, "|---|---|---|---|---|---|\n")
	fmt.Fprintf(&b, "| Direct | %s | %s | %s | %.1f q/s | %d |\n",
		r.Direct.P50.Round(time.Microsecond),
		r.Direct.P95.Round(time.Microsecond),
		r.Direct.P99.Round(time.Microsecond),
		r.Direct.Throughput,
		r.Direct.Errors,
	)
	fmt.Fprintf(&b, "| Through proxy | %s | %s | %s | %.1f q/s | %d |\n",
		r.Proxy.P50.Round(time.Microsecond),
		r.Proxy.P95.Round(time.Microsecond),
		r.Proxy.P99.Round(time.Microsecond),
		r.Proxy.Throughput,
		r.Proxy.Errors,
	)

	addedP50 := r.Proxy.P50 - r.Direct.P50
	addedP99 := r.Proxy.P99 - r.Direct.P99
	fmt.Fprintf(&b, "\n**Added latency through proxy** — p50 %s · p99 %s\n",
		addedP50.Round(time.Microsecond),
		addedP99.Round(time.Microsecond),
	)
	return b.String()
}
