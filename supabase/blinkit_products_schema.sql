-- SafeBite India — Blinkit scrape staging table (demo / evaluation).
--
-- Deliberately separate from product_reports: that table is keyed on
-- barcode and feeds the live app, while Blinkit exposes product ids and
-- no barcodes. Keeping this apart means the demo data can be inspected,
-- re-scraped or dropped without touching anything the app serves.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.blinkit_products (
  id uuid primary key default gen_random_uuid(),

  blinkit_id bigint unique not null,     -- Blinkit's own product id
  product_name text not null,
  brand text,
  unit text,                             -- "500 ml", "70 g", ...

  -- The reason this table exists: manufacturer-supplied ingredient text,
  -- not OCR'd off a photograph like the Open Food Facts entries.
  ingredients_text text not null,

  category text,                         -- derived from the sitemap path
  image_url text,
  nutrition jsonb default '{}'::jsonb,   -- energy/protein/fat/sugar etc. when present
  fssai_license text,
  source_url text,

  scraped_at timestamptz not null default now()
);

create index if not exists blinkit_products_brand_idx on public.blinkit_products (brand);
create index if not exists blinkit_products_category_idx on public.blinkit_products (category);

alter table public.blinkit_products enable row level security;

create policy "Anyone can read blinkit products"
  on public.blinkit_products for select
  using (true);

create policy "Anyone can insert blinkit products"
  on public.blinkit_products for insert
  with check (true);

create policy "Anyone can update blinkit products"
  on public.blinkit_products for update
  using (true);
