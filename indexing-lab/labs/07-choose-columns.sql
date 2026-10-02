\set ON_ERROR_STOP on
\timing on
SELECT count(DISTINCT user_id) AS users, count(DISTINCT product_code) AS products,
       count(DISTINCT region) AS regions, count(DISTINCT sale_date) AS dates FROM sales_records;

\echo 'Current indexes: insert 200,000 rows'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO sales_records (id, user_id, sale_date, product_code, region, sales_quantity, inventory)
SELECT 1000000 + g, 4, DATE '2026-10-01', 'product-0042', 'region-3', 100, 1000
FROM generate_series(1, 200000) AS g;
ROLLBACK;
VACUUM (ANALYZE) sales_records;

\echo 'Extra indexes: repeat the same insert, then restore all changes'
BEGIN;
CREATE INDEX lab_sales_quantity ON sales_records (sales_quantity);
CREATE INDEX lab_sales_inventory ON sales_records (inventory);
CREATE INDEX lab_sales_region ON sales_records (region);
SELECT pg_size_pretty(pg_indexes_size('sales_records')) AS index_size;
EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO sales_records (id, user_id, sale_date, product_code, region, sales_quantity, inventory)
SELECT 1000000 + g, 4, DATE '2026-10-01', 'product-0042', 'region-3', 100, 1000
FROM generate_series(1, 200000) AS g;
ROLLBACK;
VACUUM (ANALYZE) sales_records;

SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE relname = 'sales_records' ORDER BY idx_scan;
