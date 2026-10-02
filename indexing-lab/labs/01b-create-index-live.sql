\set ON_ERROR_STOP on
\timing on
-- Run on pg_no_index. ROLLBACK restores the original index set.
BEGIN;
\echo 'Before: simulate 100 product-history lookups'
EXPLAIN (ANALYZE, BUFFERS)
SELECT sum(x.n) FROM generate_series(1, 100) AS p(id)
CROSS JOIN LATERAL (
  SELECT count(*) AS n FROM sales_records s
  WHERE s.user_id = 4 AND s.product_code = 'product-' || lpad(p.id::text, 4, '0')
) x;

CREATE INDEX lab_sales_user_product ON sales_records (user_id, product_code);
ANALYZE sales_records;
\echo 'After: identical 100 lookups'
EXPLAIN (ANALYZE, BUFFERS)
SELECT sum(x.n) FROM generate_series(1, 100) AS p(id)
CROSS JOIN LATERAL (
  SELECT count(*) AS n FROM sales_records s
  WHERE s.user_id = 4 AND s.product_code = 'product-' || lpad(p.id::text, 4, '0')
) x;
ROLLBACK;
