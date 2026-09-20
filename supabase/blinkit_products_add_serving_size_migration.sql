-- FoodGuard India -- captures Blinkit's own REAL per-serving size.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Real bug, found live by the user testing a 2.25 litre Mountain Dew
-- bottle: the app was treating pack_size (the whole bottle/pack -- e.g.
-- "2.25 ltr") as if it were the serving size, which produced nonsense
-- like "if a 2.25 litre serving became a daily habit". Blinkit's own
-- page actually DOES print a real, separate serving size right in the
-- nutrition table ("Serve Size: 200 ml" on that exact bottle) under the
-- attribute name "Standard Serve Size" -- confirmed by fetching the real
-- live page -- which the scraper simply never captured before now (see
-- blinkit.js's scrapeProduct). pack_size itself was never wrong and is
-- untouched -- it has its own real, separate purpose (telling different
-- pack sizes of the same product apart for barcode lookups).

alter table public.blinkit_products add column if not exists serving_size text;
