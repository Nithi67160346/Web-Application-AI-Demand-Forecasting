\set ON_ERROR_STOP on
-- 1. Design an index for monthly regional totals for one user; measure before/after.
EXPLAIN (ANALYZE, BUFFERS)
SELECT sale_date, sum(sales_quantity) FROM sales_records
WHERE user_id = 4 AND region = 'region-3'
  AND sale_date >= DATE '2026-09-01' AND sale_date < DATE '2026-10-01'
GROUP BY sale_date ORDER BY sale_date;
-- 2. Write a query for the user's top 5 products in September 2026.
--    Does an index avoid aggregating every matching sale? Explain with evidence.
-- 3. Rewrite the following without creating a new index:
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records WHERE user_id = 4 AND to_char(sale_date, 'YYYY-MM') = '2026-09';
-- Put experimental CREATE INDEX statements inside BEGIN ... ROLLBACK.
-- 4. Propose indexes for Forecast/Alert tables only after defining real query patterns.
