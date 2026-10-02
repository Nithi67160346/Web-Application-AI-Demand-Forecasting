"""Compare real PostgreSQL plans via Docker; Python stdlib only, no DB driver.

Run: python indexing-lab/benchmark.py --runs 5
This script never creates/drops indexes or writes sales records.
"""

import argparse
import csv
import json
import platform
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

LAB = Path(__file__).resolve().parent
SERVICES = ("pg_no_index", "pg_with_index")
DSNS = {}
PREFIX = "user_id = 4 AND product_code = 'product-0042' AND region = 'region-3'"
DATE_RANGE = "sale_date >= DATE '2026-07-01' AND sale_date < DATE '2026-10-01'"
QUERIES = {
    "exact_date": "SELECT * FROM sales_records WHERE user_id = 4 AND sale_date = DATE '2026-09-10'",
    "product_region_range": f"SELECT * FROM sales_records WHERE {PREFIX} AND {DATE_RANGE}",
    "latest_page": f"SELECT * FROM sales_records WHERE {PREFIX} ORDER BY sale_date DESC, id DESC LIMIT 50",
    "cursor_page": f"SELECT * FROM sales_records WHERE {PREFIX} AND (sale_date, id) < (DATE '2026-08-01', 500000) ORDER BY sale_date DESC, id DESC LIMIT 50",
    "daily_totals": f"SELECT sale_date, sum(sales_quantity) FROM sales_records WHERE {PREFIX} AND {DATE_RANGE} GROUP BY sale_date ORDER BY sale_date",
    "count_date": "SELECT count(*) FROM sales_records WHERE user_id = 4 AND sale_date = DATE '2026-09-10'",
    "wide_range": "SELECT sum(sales_quantity) FROM sales_records WHERE sale_date >= DATE '2025-01-01'",
}


def psql(service, sql):
    if DSNS:
        import psycopg

        try:
            with psycopg.connect(DSNS[service], autocommit=True) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql)
                    value = cursor.fetchone()[0]
                    return json.dumps(value) if isinstance(value, (dict, list)) else str(value)
        except psycopg.Error as exc:
            raise RuntimeError(f"{service}: PostgreSQL query failed: {exc}") from exc
    command = [
        "docker", "compose", "-f", str(LAB / "docker-compose.yml"), "exec", "-T", service,
        "psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "student", "-d", "demandly_lab", "-c", sql,
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=180)
    if completed.returncode:
        raise RuntimeError(f"{service}: {completed.stderr.strip()}")
    return completed.stdout.strip()


def walk(node):
    yield node
    for child in node.get("Plans", []):
        yield from walk(child)


def explain(service, query):
    return json.loads(psql(service, f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"))[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--output", type=Path, default=LAB / "results")
    parser.add_argument("--dsn-no-index", help="Optional isolated PostgreSQL baseline DSN (requires psycopg)")
    parser.add_argument("--dsn-with-index", help="Optional isolated indexed PostgreSQL DSN (requires psycopg)")
    args = parser.parse_args()
    if not 3 <= args.runs <= 30:
        parser.error("--runs must be between 3 and 30")
    if bool(args.dsn_no_index) != bool(args.dsn_with_index):
        parser.error("Supply both DSNs or neither")
    if args.dsn_no_index:
        DSNS.update(zip(SERVICES, (args.dsn_no_index, args.dsn_with_index)))

    metadata = {}
    fingerprint_sql = """SELECT json_build_object(
        'rows', count(*), 'ids', sum(id),
        'fingerprint', sum(hashtextextended(ROW(id,user_id,sale_date,product_code,region,sales_quantity,inventory)::text, 0)::numeric)::text)
        FROM sales_records"""
    for service in SERVICES:
        fingerprint = json.loads(psql(service, fingerprint_sql))
        indexes = json.loads(psql(service, "SELECT json_agg(indexname ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='sales_records'"))
        expected = {"sales_records_pkey"}
        if service == "pg_with_index":
            expected |= {"idx_sales_user_date", "idx_sales_user_product_region_date"}
        if set(indexes) != expected:
            raise RuntimeError(f"{service}: unexpected indexes {indexes}; finish/rollback workshop changes first")
        if fingerprint["rows"] != 1_000_000:
            raise RuntimeError(f"{service}: expected 1,000,000 rows; got {fingerprint['rows']}")
        sizes = json.loads(psql(service, "SELECT json_build_object('table_bytes', pg_relation_size('sales_records'), 'index_bytes', pg_indexes_size('sales_records'), 'total_bytes', pg_total_relation_size('sales_records'))"))
        metadata[service] = {"data": fingerprint, "indexes": indexes, "sizes": sizes, "version": psql(service, "SELECT version()")}
    if metadata[SERVICES[0]]["data"] != metadata[SERVICES[1]]["data"]:
        raise RuntimeError("Datasets differ; cannot make a fair index comparison")

    results, summary = {}, []
    for name, query in QUERIES.items():
        print(f"Measuring {name} ...", flush=True)
        # Compare output contents as well as plans, outside timed runs.
        hash_sql = f"SELECT md5(coalesce(string_agg(ROW(q.*)::text, '|' ORDER BY ROW(q.*)::text), '')) FROM ({query}) q"
        if psql(SERVICES[0], hash_sql) != psql(SERVICES[1], hash_sql):
            raise RuntimeError(f"Query results differ: {name}")
        for service in SERVICES:
            explain(service, query)  # Discard one warm-up per query/database.
        samples = {service: [] for service in SERVICES}
        for iteration in range(args.runs):
            # Alternate execution order to reduce order/cache bias.
            for service in SERVICES if iteration % 2 == 0 else SERVICES[::-1]:
                samples[service].append(explain(service, query))
        medians = {}
        for service in SERVICES:
            plans = samples[service]
            median = statistics.median(plan["Execution Time"] for plan in plans)
            medians[service] = median
            representative = min(plans, key=lambda plan: abs(plan["Execution Time"] - median))
            nodes = list(walk(representative["Plan"]))
            summary.append({
                "query": name, "service": service, "median_ms": median,
                "min_ms": min(p["Execution Time"] for p in plans),
                "max_ms": max(p["Execution Time"] for p in plans),
                "nodes": ", ".join(sorted({n["Node Type"] for n in nodes})),
                "indexes": ", ".join(sorted({n["Index Name"] for n in nodes if "Index Name" in n})),
                # Root counters include children; adding all node counters double-counts.
                "shared_hit_blocks": representative["Plan"].get("Shared Hit Blocks", 0),
                "shared_read_blocks": representative["Plan"].get("Shared Read Blocks", 0),
            })
        results[name] = {"sql": query, "samples": samples, "speedup": medians[SERVICES[0]] / max(medians[SERVICES[1]], 0.000001)}

    stamp = datetime.now(timezone.utc).isoformat()
    report = {"generated_at_utc": stamp, "host": platform.platform(), "connection_mode": "direct PostgreSQL" if DSNS else "Docker Compose", "runs": args.runs, "metadata": metadata, "results": results}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "benchmark.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    with (args.output / "benchmark.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
    lines = ["# Demandly indexing benchmark", "", f"Measured: {stamp}; median of {args.runs} runs after one warm-up per query/database.",
             f"Connection mode: {report['connection_mode']}", "",
             "PostgreSQL Execution Time from EXPLAIN ANALYZE; excludes Docker/HTTP/serialization overhead.", "",
             "| Query | No index (ms) | With index (ms) | Speedup |", "|---|---:|---:|---:|"]
    for name, data in results.items():
        times = [statistics.median(p["Execution Time"] for p in data["samples"][s]) for s in SERVICES]
        lines.append(f"| {name} | {times[0]:.3f} | {times[1]:.3f} | {data['speedup']:.2f}x |")
    lines += ["", "| Database | Table bytes | Index bytes | Total bytes |", "|---|---:|---:|---:|"]
    for service in SERVICES:
        sizes = metadata[service]["sizes"]
        lines.append(f"| {service} | {sizes['table_bytes']} | {sizes['index_bytes']} | {sizes['total_bytes']} |")
    lines += ["", "Identical 1,000,000-row fingerprints and query outputs verified. The baseline retains its primary key.",
              "Warm-up does not guarantee all data pages remain in shared buffers. Numbers vary with hardware, cache, data distribution and PostgreSQL statistics. A wide-range scan may not improve.",
              "See benchmark.csv for buffers/index names and benchmark.json for all plans and PostgreSQL versions.", ""]
    (args.output / "benchmark.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"Saved reports to {args.output.resolve()}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError, ImportError) as exc:
        print(f"Benchmark failed: {exc}", file=sys.stderr)
        sys.exit(1)
