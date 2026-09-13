-- SafeBite India — let blinkit_products hold more than one retailer's rows.
--
-- scripts/scrape-jiomart.js now writes into this same table instead of a
-- separate jiomart_products one -- same shape (manufacturer-supplied
-- ingredients + a real product photo), no reason to duplicate the
-- schema/progress-tracking infrastructure for a second retailer.
-- `source` is what tells the two apart afterward (e.g. to clean up or
-- re-scrape just one retailer's rows without touching the other's).
--
-- Run this once in the Supabase SQL Editor, after blinkit_products_schema.sql
-- and blinkit_products_migration.sql have both already been run.

alter table public.blinkit_products
  add column if not exists source text not null default 'blinkit';

-- Existing rows predate this column and are all genuinely from Blinkit --
-- the default above only applies to rows inserted from now on, so
-- backfill the ones already there explicitly.
update public.blinkit_products set source = 'blinkit' where source is null;

create index if not exists blinkit_products_source_idx on public.blinkit_products (source);
