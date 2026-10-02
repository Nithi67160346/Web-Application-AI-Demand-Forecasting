\set ON_ERROR_STOP on
\timing on
-- Run on both DBs. Explicit IDs avoid advancing the BIGSERIAL sequence.
-- ROLLBACK undoes rows, but writes/WAL and dead tuples still cost resources.
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO sales_records (id, user_id, sale_date, product_code, region, sales_quantity, inventory)
SELECT 1000000 + g, 4, DATE '2026-10-01', 'product-0042', 'region-3', 100, 1000
FROM generate_series(1, 200000) AS g;
ROLLBACK;
VACUUM (ANALYZE) sales_records;
