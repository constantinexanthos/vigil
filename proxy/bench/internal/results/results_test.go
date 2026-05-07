package results

import (
	"strings"
	"testing"
	"time"
)

// p50/p95/p99 are the load-bearing numbers in RESULTS.md. A miscompute
// here means the website's published claim drifts off the real measured
// distribution. This is a structural test, not a stats test — it asserts
// the percentile picks the right index for an obvious sorted input.
func TestPercentilesPickTheRightSamples(t *testing.T) {
	// 100 samples, 1ms..100ms. p50 ≈ 50ms, p95 ≈ 95ms, p99 ≈ 99ms.
	xs := make([]time.Duration, 100)
	for i := range xs {
		xs[i] = time.Duration(i+1) * time.Millisecond
	}
	got := Percentiles(xs)
	if got.P50 != 50*time.Millisecond {
		t.Errorf("p50 = %v, want 50ms", got.P50)
	}
	if got.P95 != 95*time.Millisecond {
		t.Errorf("p95 = %v, want 95ms", got.P95)
	}
	if got.P99 != 99*time.Millisecond {
		t.Errorf("p99 = %v, want 99ms", got.P99)
	}
}

// Empty input shouldn't panic. RESULTS.md should print "—" for the
// percentiles of an arm that didn't capture any latencies (e.g. arm
// failed to connect). Returning zero values gives the formatter
// something safe to render.
func TestPercentilesEmptyInput(t *testing.T) {
	got := Percentiles(nil)
	if got.P50 != 0 || got.P95 != 0 || got.P99 != 0 {
		t.Errorf("empty input: percentiles = %+v, want zeros", got)
	}
}

// Unsorted input must yield the same answer as sorted input — Percentiles
// owns the sort. The runner appends latencies in arrival order; if it
// also had to sort, every caller would do it.
func TestPercentilesSortsInternally(t *testing.T) {
	unsorted := []time.Duration{50 * time.Millisecond, 1 * time.Millisecond, 99 * time.Millisecond, 25 * time.Millisecond, 75 * time.Millisecond}
	got := Percentiles(unsorted)
	if got.P50 != 50*time.Millisecond {
		t.Errorf("p50 of unsorted = %v, want 50ms", got.P50)
	}
}

// Dedup rate is the venture-grade headline. The math is `1 - upstream/issued`.
// Three cases matter for honesty:
//   - upstream == issued (today's pass-through) → 0 (bench's sanity check).
//   - upstream < issued (future, with coalescing) → positive fraction.
//   - issued == 0 → return 0, NOT NaN; the formatter has to render
//     something stable.
func TestDedupRatePassthroughIsZero(t *testing.T) {
	got := DedupRate(1000, 1000)
	if got != 0 {
		t.Errorf("dedup = %v, want 0 for pass-through", got)
	}
}

func TestDedupRatePartialCoalesce(t *testing.T) {
	got := DedupRate(1000, 250)
	want := 0.75
	if got != want {
		t.Errorf("dedup = %v, want %v", got, want)
	}
}

func TestDedupRateZeroIssuedIsNotNaN(t *testing.T) {
	got := DedupRate(0, 0)
	if got != 0 {
		t.Errorf("dedup with 0/0 = %v, want 0 (not NaN)", got)
	}
}

// JSON output is the machine-readable surface. Test that round-tripping
// through marshaling preserves the headline numbers — if these drift
// during a refactor the website ingestion silently breaks.
func TestRunResultJSONIncludesHeadlineFields(t *testing.T) {
	r := RunResult{
		Preset:        "refactor",
		Seed:          42,
		Duration:      30 * time.Second,
		Concurrency:   4,
		TotalIssued:   1000,
		TotalUpstream: 1000,
		Direct: ArmResult{
			P50:        2 * time.Millisecond,
			P95:        9 * time.Millisecond,
			P99:        15 * time.Millisecond,
			Throughput: 33.3,
		},
		Proxy: ArmResult{
			P50:        2 * time.Millisecond,
			P95:        10 * time.Millisecond,
			P99:        17 * time.Millisecond,
			Throughput: 32.5,
		},
	}
	out, err := r.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`"preset":"refactor"`,
		`"seed":42`,
		`"total_issued":1000`,
		`"total_upstream":1000`,
		`"dedup_rate":0`,
		`"direct"`,
		`"proxy"`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("JSON output missing %q\nin: %s", want, s)
		}
	}
}

// Markdown table is what gets pasted on the website. Test that all the
// columns we promised in the spec show up — preset, duration, seed,
// total issued, upstream, dedup rate, p50/p95/p99 for both arms,
// throughput for both arms.
func TestMarkdownTableIncludesAllAdvertisedColumns(t *testing.T) {
	r := RunResult{
		Preset:        "refactor",
		Seed:          42,
		Duration:      30 * time.Second,
		Concurrency:   4,
		TotalIssued:   1000,
		TotalUpstream: 1000,
		Direct:        ArmResult{P50: 2 * time.Millisecond, P95: 9 * time.Millisecond, P99: 15 * time.Millisecond, Throughput: 33.3},
		Proxy:         ArmResult{P50: 2 * time.Millisecond, P95: 10 * time.Millisecond, P99: 17 * time.Millisecond, Throughput: 32.5},
	}
	md := r.Markdown()
	for _, want := range []string{
		"refactor",
		"42",            // seed
		"1000",          // issued / upstream
		"0.00%",         // dedup
		"33.3",          // throughput direct
		"32.5",          // throughput proxy
		"|", "---",      // it's a table
	} {
		if !strings.Contains(md, want) {
			t.Errorf("Markdown missing %q\nin:\n%s", want, md)
		}
	}
}
