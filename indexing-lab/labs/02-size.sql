\set ON_ERROR_STOP on
SELECT pg_size_pretty(pg_relation_size('sales_records')) AS table_size,
       pg_size_pretty(pg_indexes_size('sales_records')) AS index_size,
       pg_size_pretty(pg_total_relation_size('sales_records')) AS total_size;
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size,
       idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes WHERE relname = 'sales_records' ORDER BY indexrelname;
