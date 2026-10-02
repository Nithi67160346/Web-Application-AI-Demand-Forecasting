\set ON_ERROR_STOP on
-- Apply to an existing Demandly DB after the users table has been created.
-- Fresh installations also create this table and its indexes via SQLAlchemy.
CREATE TABLE IF NOT EXISTS public.sales_records (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sale_date DATE NOT NULL,
    product_code VARCHAR(64) NOT NULL,
    region VARCHAR(64) NOT NULL,
    sales_quantity INTEGER NOT NULL,
    inventory INTEGER,
    CONSTRAINT ck_sales_quantity_nonnegative CHECK (sales_quantity >= 0),
    CONSTRAINT ck_sales_inventory_nonnegative CHECK (inventory IS NULL OR inventory >= 0)
);
