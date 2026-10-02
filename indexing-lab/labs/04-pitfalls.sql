\set ON_ERROR_STOP on
\timing on
-- Equivalent monthly filters: wrapping sale_date prevents an ordinary date index range.
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id = 4 AND to_char(sale_date, 'YYYY-MM') = '2026-09';
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id = 4
  AND sale_date >= DATE '2026-09-01' AND sale_date < DATE '2026-10-01';

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id + 0 = 4;
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id = 4;

BEGIN;
CREATE INDEX lab_sales_region ON sales_records (region);
CREATE INDEX lab_sales_product_pattern ON sales_records (product_code varchar_pattern_ops);
ANALYZE sales_records;
-- Five region values: 20% of the table is often too broad for efficient heap reads.
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM sales_records WHERE region = 'region-3';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM sales_records WHERE product_code LIKE 'product-004%';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM sales_records WHERE product_code LIKE '%0042';
ROLLBACK;
