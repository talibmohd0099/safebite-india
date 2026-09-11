-- SafeBite India — raw product catalog, separate from computed reports.
--
-- Splits what used to live only inside product_reports into two stages:
-- this table holds the raw facts about a product (name, brand,
-- ingredients text, image) as fetched from Open Food Facts, and
-- product_reports holds the computed score/verdict/AI summary derived
-- from it. The point: discovering new products (fast, no AI) no longer
-- has to happen in the same step as generating their report (slower,
-- Gemini-limited) -- and if the scoring rules ever change again, every
-- report can be recomputed from what's already here without re-fetching
-- anything from Open Food Facts.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  lookup_key text unique not null,   -- same barcode-based key product_reports uses
  source text not null,              -- 'barcode' | 'photo' | 'text'
  product_name text,
  brand text,
  ingredients_text text not null,
  off_ingredients jsonb,             -- Open Food Facts' structured per-ingredient list, when known (percent estimates)
  image_url text,

  report_generated_at timestamptz,   -- null = still waiting for scripts/generate-reports.js to process it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_lookup_key_idx on public.products (lookup_key);

-- Lets generate-reports.js fetch "everything still waiting" without
-- scanning the whole table.
create index if not exists products_pending_report_idx
  on public.products (created_at)
  where report_generated_at is null;

alter table public.products enable row level security;

create policy "Anyone can read products"
  on public.products for select
  using (true);

create policy "Anyone can insert products"
  on public.products for insert
  with check (true);

create policy "Anyone can update products"
  on public.products for update
  using (true);
