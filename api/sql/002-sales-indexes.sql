\set ON_ERROR_STOP on
-- Run with psql, outside BEGIN/COMMIT. Supports existing populated tables.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_user_product_region_date
    ON public.sales_records (user_id, product_code, region, sale_date, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_user_date
    ON public.sales_records (user_id, sale_date, id);
ANALYZE public.sales_records;
