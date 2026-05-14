# Vigil bench — RESULTS

Generated 2026-05-14T23:07:13Z · seed=42 · runtime=darwin/arm64

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
| Wall time | 10.819s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 63435 |
| Queries hitting upstream | 484 |
| Dedup rate | 99.24% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 239µs | 765µs | 1.059ms | 13716.3 q/s | 0 |
| Through proxy | 73µs | 1.177ms | 1.746ms | 12686.9 q/s | 0 |

**Added latency through proxy** — p50 -166µs · p99 687µs

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
| Wall time | 10.732s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 58238 |
| Queries hitting upstream | 567 |
| Dedup rate | 99.03% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 260µs | 644µs | 1.126ms | 12547.1 q/s | 0 |
| Through proxy | 75µs | 1.177ms | 1.903ms | 11647.5 q/s | 0 |

**Added latency through proxy** — p50 -185µs · p99 777µs

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
| Wall time | 10.734s |

**Volume & dedup**

| | |
|---|---|
| Total queries issued | 15189 |
| Queries hitting upstream | 13353 |
| Dedup rate | 12.09% |

**Latency**

| Arm | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| Direct | 247µs | 378µs | 494µs | 15388.3 q/s | 0 |
| Through proxy | 1.168ms | 2.774ms | 3.648ms | 3037.6 q/s | 0 |

**Added latency through proxy** — p50 921µs · p99 3.154ms
