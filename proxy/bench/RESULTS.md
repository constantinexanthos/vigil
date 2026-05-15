# Vigil bench — RESULTS

Generated 2026-05-15T01:04:08Z · seed=42 · runtime=darwin/arm64

> v0.1.0d coalescing: per-agent query result cache, 250ms TTL. The refactor
> preset models an AI coding agent re-fetching the same handful of records;
> dedup rate is what the website's "40-80% cost reduction" claim quantifies.
> Production preset's low dedup rate is by design — human-shaped traffic
> against a wide key universe runs untouched.

### Preset: refactor

**Config**

| | |
|---|---|
| Seed | 42 |
| Duration | 5s |
| Concurrency | 4 |
| Postgres | PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Hardware | arm64/darwin |
| Wall time | 11.256s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 3489 |
| Queries hitting upstream | 226 |
| Dedup rate | 93.52% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 247µs | 887µs | 1.221ms | 12710.5 q/s | 0 |
| Through proxy | 2.643ms | 24.434ms | 42.059ms | 697.6 q/s | 0 |

**Added latency through proxy** — p50 2.396ms · p99 40.838ms

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
| Wall time | 12.167s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 3489 |
| Queries hitting upstream | 296 |
| Dedup rate | 91.52% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 250µs | 841µs | 1.273ms | 12174.1 q/s | 0 |
| Through proxy | 2.751ms | 21.965ms | 39.996ms | 697.8 q/s | 0 |

**Added latency through proxy** — p50 2.501ms · p99 38.723ms

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
| Wall time | 10.749s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 3487 |
| Queries hitting upstream | 3372 |
| Dedup rate | 3.30% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 247µs | 368µs | 510µs | 15358.9 q/s | 0 |
| Through proxy | 3.757ms | 18.091ms | 32.387ms | 697.3 q/s | 0 |

**Added latency through proxy** — p50 3.509ms · p99 31.877ms
