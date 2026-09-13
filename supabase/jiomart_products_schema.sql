-- SafeBite India — JioMart scrape staging table (demo / evaluation).
--
-- Second, independent source alongside blinkit_products: Blinkit started
-- returning 403 Forbidden on 2026-09-10 (see
-- .github/workflows/scrape-blinkit.yml), so this is a different
-- retailer entirely rather than a retry against the same block.
--
-- Deliberately separate from product_reports: that table is keyed on
-- barcode and feeds the live app, while JioMart exposes its own product
-- URLs and no barcodes. Keeping this apart means the demo data can be
-- inspected, re-scraped or dropped without touching anything the app
-- serves.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.jiomart_products (
  id uuid primary key default gen_random_uuid(),

  product_name text not null,
  brand text default '',

  -- The reason this table exists: manufacturer-supplied ingredient text
  -- and a real product photo, not OCR'd off a crowdsourced pack photo
  -- like the Open Food Facts entries.
  ingredients_text text not null,

  category text,                         -- derived from the sitemap path
  image_url text,
  source_url text,                       -- the exact page this was scraped from

  scraped_at timestamptz not null default now()
);

create index if not exists jiomart_products_brand_idx on public.jiomart_products (brand);
create index if not exists jiomart_products_category_idx on public.jiomart_products (category);

alter table public.jiomart_products
  add constraint jiomart_products_brand_product_key unique (brand, product_name);

alter table public.jiomart_products enable row level security;

create policy "Anyone can read jiomart products"
  on public.jiomart_products for select
  using (true);

create policy "Anyone can insert jiomart products"
  on public.jiomart_products for insert
  with check (true);

create policy "Anyone can update jiomart products"
  on public.jiomart_products for update
  using (true);
