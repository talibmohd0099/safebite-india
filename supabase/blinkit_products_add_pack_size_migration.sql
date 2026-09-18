-- FoodGuard India -- captures Blinkit's own "Unit (with options)" /
-- "Net Weight" attribute (e.g. "500 g", "2 x 2 kg"), dropped by an
-- earlier migration and now needed again: without it, nobody editing
-- a Blinkit-scraped product (which has no barcode at all) can tell
-- WHICH pack size they're looking at, and different pack sizes of the
-- same product have different real barcodes -- see blinkit.js's
-- scrapeProduct() for where this gets filled in going forward.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.blinkit_products
  add column if not exists pack_size text;
