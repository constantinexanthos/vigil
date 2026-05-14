# Vigil bench — RESULTS

Generated 2026-05-14T22:52:52Z · seed=42 · runtime=darwin/arm64

> The proxy is currently bytes-equivalent passthrough (v0.1.0a). Dedup rate is
> expected to be ≈ 0% — the harness reports it for sanity. Once coalescing
> lands (v0.1.0d), the same harness re-runs against the same seed to publish
> the actual reduction.

### Preset: refactor

**Config**

| | |
|---|---|
| Seed | 42 |
| Duration | 5s |
| Concurrency | 4 |
| Postgres | PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Hardware | arm64/darwin |
| Wall time | 10.997s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 10183 |
| Queries hitting upstream | 10183 |
| Dedup rate | 0.00% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 248µs | 398µs | 512µs | 15110.3 q/s | 0 |
| Through proxy | 1.679ms | 4.176ms | 5.488ms | 2036.5 q/s | 0 |

**Added latency through proxy** — p50 1.431ms · p99 4.976ms
