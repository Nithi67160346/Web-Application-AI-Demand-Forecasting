# Demandly indexing benchmark

Measured: 2026-10-02T20:58:10.983199+00:00; median of 5 runs after one warm-up per query/database.
Connection mode: direct PostgreSQL

PostgreSQL Execution Time from EXPLAIN ANALYZE; excludes Docker/HTTP/serialization overhead.

| Query | No index (ms) | With index (ms) | Speedup |
|---|---:|---:|---:|
| exact_date | 69.758 | 0.754 | 92.52x |
| product_region_range | 67.725 | 0.196 | 345.54x |
| latest_page | 61.217 | 0.226 | 270.87x |
| cursor_page | 67.724 | 0.315 | 215.00x |
| daily_totals | 78.085 | 0.315 | 247.89x |
| count_date | 68.388 | 0.200 | 341.94x |
| wide_range | 82.020 | 89.692 | 0.91x |

| Database | Table bytes | Index bytes | Total bytes |
|---|---:|---:|---:|
| pg_no_index | 76562432 | 22487040 | 99098624 |
| pg_with_index | 76562432 | 113033216 | 189644800 |

Identical 1,000,000-row fingerprints and query outputs verified. The baseline retains its primary key.
Warm-up does not guarantee all data pages remain in shared buffers. Numbers vary with hardware, cache, data distribution and PostgreSQL statistics. A wide-range scan may not improve.
See benchmark.csv for buffers/index names and benchmark.json for all plans and PostgreSQL versions.
