# Vigil bench — RESULTS

Generated 2026-05-07T21:10:13Z · seed=42 · runtime=darwin/arm64

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
| Wall time | 11.198s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 55875 |
| Queries hitting upstream | 55875 |
| Dedup rate | 0.00% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 252µs | 387µs | 495µs | 14847.3 q/s | 0 |
| Through proxy | 339µs | 490µs | 625µs | 11174.9 q/s | 0 |

**Added latency through proxy** — p50 87µs · p99 130µs

---

### Preset: mixed

**Config**

| | |
|---|---|
| Seed | 42 |
| Duration | 5s |
| Concurrency | 4 |
| Postgres | PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Hardware | arm64/darwin |
| Wall time | 11.158s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 51405 |
| Queries hitting upstream | 51405 |
| Dedup rate | 0.00% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 270µs | 433µs | 529µs | 13735.9 q/s | 0 |
| Through proxy | 364µs | 559µs | 707µs | 10280.9 q/s | 0 |

**Added latency through proxy** — p50 94µs · p99 178µs

---

### Preset: production

**Config**

| | |
|---|---|
| Seed | 42 |
| Duration | 5s |
| Concurrency | 4 |
| Postgres | PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Hardware | arm64/darwin |
| Wall time | 11.028s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 62880 |
| Queries hitting upstream | 62880 |
| Dedup rate | 0.00% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 242µs | 335µs | 398µs | 16101.2 q/s | 0 |
| Through proxy | 312µs | 411µs | 470µs | 12575.8 q/s | 0 |

**Added latency through proxy** — p50 70µs · p99 72µs
