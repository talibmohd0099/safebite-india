-- SafeBite India — let generate-reports.js track which scraped Blinkit/
-- JioMart rows already have a real product_reports row.
--
-- Same mechanism products.report_generated_at already uses for the Open
-- Food Facts discovery backlog, applied to blinkit_products so scraped
-- rows actually flow into the live, searchable catalog instead of
-- staying isolated in this staging table forever.
--
-- Run this once in the Supabase SQL Editor, after blinkit_products_schema.sql
-- and blinkit_products_add_source_migration.sql have both already been run.

alter table public.blinkit_products
  add column if not exists report_generated_at timestamptz;

create index if not exists blinkit_products_pending_idx
  on public.blinkit_products (scraped_at)
  where report_generated_at is null;
