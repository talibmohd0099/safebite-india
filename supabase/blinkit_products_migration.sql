-- SafeBite India — trim the Blinkit staging table.
--
-- Drops blinkit_id, unit and source_url. blinkit_id was the upsert key,
-- so a unique constraint on (brand, product_name) replaces it — which
-- also means the same product in different pack sizes now collapses to
-- one row instead of several (unit was what told them apart).
--
-- Run this once in the Supabase SQL Editor.

alter table public.blinkit_products drop column if exists blinkit_id;
alter table public.blinkit_products drop column if exists unit;
alter table public.blinkit_products drop column if exists source_url;

-- Brand defaults to '' rather than NULL so the unique constraint
-- actually catches duplicates (Postgres treats NULLs as distinct).
update public.blinkit_products set brand = '' where brand is null;
alter table public.blinkit_products alter column brand set default '';

-- Collapse any duplicates the old per-SKU rows left behind, keeping the
-- most recently scraped of each.
delete from public.blinkit_products a
using public.blinkit_products b
where a.brand = b.brand
  and a.product_name = b.product_name
  and a.scraped_at < b.scraped_at;

alter table public.blinkit_products
  drop constraint if exists blinkit_products_brand_product_key;
alter table public.blinkit_products
  add constraint blinkit_products_brand_product_key unique (brand, product_name);
