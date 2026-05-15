# Long-running stability — observed values

vigil-bench (workload generator with embedded proxy) over the QA window.
Bench started 2026-05-14 22:35:48 with `BENCH_DURATION=1800s BENCH_PRESET=refactor make bench`.

## Snapshot — T+~1min (22:36)

- PID 42493 (`go run` parent), child not yet stable
- RSS: ~136 MB
- fds: not captured (process still initializing)
- bench-spawned proxy.db: 24 KB

## Snapshot — T+~12min (22:48)

- PID 42506 (actual vigil-bench workload runner)
- RSS: 459,152 KB (≈ 449 MB)
- VSZ: 419,798,672 KB
- CPU time: 8m 21s (≈ 1.0 CPU saturated → workload is bound by query throughput, not the runtime)
- fds open: 214
- bench-spawned proxy.db: 24,576 bytes (24 KB)

## Snapshot — T+~15min (22:51)

- Same PID 42506
- RSS stable at ≈ 449 MB (no growth vs T+12min snapshot)
- fds stable at 214 (no leak across 3 minutes of additional load)
- proxy.db: 24,576 bytes (bench writes results to results.json + RESULTS.md, not the audit DB)

## What we can conclude

**Stable, no leaks observed within the captured window.** RSS held steady. fd count held steady. No file-descriptor or memory drift across 3+ minutes of mid-run steady state.

**Caveat 1 — the harness is not the proxy.** `vigil-bench` is the workload generator + embedded proxy used as a measurement instrument. It collects per-query latency samples in memory for the histogram, so its RSS combines workload-generator + identity store + audit-DB writer + pgproto3 parser + every measurement sample. To isolate the proxy's true memory footprint, the right follow-up is a long-lived `vigil-proxy --postgres-listen :7432 --postgres-upstream …` plus an external pgbench-style workload, watching only the proxy's RSS over time.

**Caveat 2 — 30-min run not finalized at report write time.** The bench was started at 22:35:48 with a 30-minute refactor preset; QA report was compiled at ~T+30min mark. The two stability snapshots span ~3 minutes of mid-run steady-state, which is enough to rule out an immediate-OOM / fd-leak / WAL-runaway bug, but not enough to call multi-hour stability "verified". File this as a follow-up: 4-hour run with a standalone `vigil-proxy` binary + external pgbench.

**Caveat 3 — clean SIGTERM confirmed separately.** The QA-side proxy (`/tmp/qa-proxy-pid`, which had absorbed the 100-concurrent-connection burst earlier in the session) was sent `SIGTERM` and exited within 1 second with a `shutting down` log line. Exit code 0. No zombie processes after `kill`.
