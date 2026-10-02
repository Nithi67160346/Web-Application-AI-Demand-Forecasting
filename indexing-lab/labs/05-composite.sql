\set ON_ERROR_STOP on
\timing on
-- Run on pg_with_index. Isolate the composite index for this experiment.
BEGIN;
DROP INDEX idx_sales_user_date;
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id = 4 AND product_code = 'product-0042';
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records
WHERE user_id = 4 AND product_code = 'product-0042' AND region = 'region-3'
  AND sale_date >= DATE '2026-07-01';
-- Omitting leading columns can require scanning much more of the index/table.
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE sale_date = DATE '2026-09-10';
-- Equality prefix + matching ordering can avoid a separate Sort.
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records
WHERE user_id = 4 AND product_code = 'product-0042' AND region = 'region-3'
ORDER BY sale_date DESC, id DESC LIMIT 50;
ROLLBACK;
