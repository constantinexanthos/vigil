# Vigil bench — RESULTS

Generated 2026-05-15T01:26:31Z · seed=42 · runtime=darwin/arm64

> v0.1.0d coalescing: per-agent query result cache, 250ms TTL. The refactor
> preset models an AI coding agent re-fetching the same handful of records;
> dedup rate is what the website's "40-80% cost reduction" claim quantifies.
> Production preset's low dedup rate is by design — human-shaped traffic
> against a wide key universe runs untouched.

### Preset: production

**Config**

| | |
|---|---|
| Seed | 42 |
| Duration | 5s |
| Concurrency | 4 |
| Postgres | PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Hardware | arm64/darwin |
| Wall time | 10.724s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 3666 |
| Queries hitting upstream | 3490 |
| Dedup rate | 4.80% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 249µs | 335µs | 396µs | 15707.4 q/s | 0 |
| Through proxy | 2.225ms | 21.978ms | 39.378ms | 733.2 q/s | 0 |

**Added latency through proxy** — p50 1.976ms · p99 38.982ms
