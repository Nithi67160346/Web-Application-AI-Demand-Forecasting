\set ON_ERROR_STOP on
\echo 'Seeding 1,000,000 synthetic sales records ...'
-- Deterministic arithmetic: both databases contain identical records.
-- 10 owners, 100 products, 5 regions, 730 days; no customer data is copied.
INSERT INTO public.sales_records (user_id, sale_date, product_code, region, sales_quantity, inventory)
SELECT (g % 10 + 1)::int,
       DATE '2024-10-01' + ((g * 37 + g / 5000) % 730)::int,
       'product-' || lpad((g / 10 % 100 + 1)::text, 4, '0'),
       'region-' || (g / 1000 % 5 + 1),
       (g * 13 % 500 + 1)::int,
       (g * 19 % 10000)::int
FROM generate_series(1::bigint, 1000000::bigint) AS g;
VACUUM (ANALYZE) public.sales_records;
\echo 'Seed done'
