\set ON_ERROR_STOP on
\timing on
\echo '1. Exact date within a user (idx_sales_user_date)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id = 4 AND sale_date = DATE '2026-09-10';

\echo '2. Product + region + narrow date range (composite index)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records
WHERE user_id = 4 AND product_code = 'product-0042' AND region = 'region-3'
  AND sale_date >= DATE '2026-07-01' AND sale_date < DATE '2026-10-01';

\echo '3. Latest history page: same ordering and limit as GET /sales'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records
WHERE user_id = 4 AND product_code = 'product-0042' AND region = 'region-3'
ORDER BY sale_date DESC, id DESC LIMIT 50;

\echo '4. Wide range across all users: a Seq Scan may be cheaper'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE sale_date >= DATE '2025-01-01';

\echo '5. Daily totals: same query as GET /sales/daily'
EXPLAIN (ANALYZE, BUFFERS)
SELECT sale_date, sum(sales_quantity) AS sales_quantity FROM sales_records
WHERE user_id = 4 AND product_code = 'product-0042' AND region = 'region-3'
  AND sale_date >= DATE '2026-07-01' AND sale_date < DATE '2026-10-01'
GROUP BY sale_date ORDER BY sale_date;

\echo '6. Count: VACUUM after seed enables possible Index Only Scan'
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM sales_records WHERE user_id = 4 AND sale_date = DATE '2026-09-10';
