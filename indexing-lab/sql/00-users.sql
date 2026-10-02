\set ON_ERROR_STOP on
-- Only ownership IDs are needed in the isolated lab; these are not login accounts.
CREATE TABLE public.users (id INTEGER PRIMARY KEY);
INSERT INTO public.users SELECT generate_series(1, 10);
