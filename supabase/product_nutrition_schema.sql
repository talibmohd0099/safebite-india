-- FoodGuard India — real, per-product nutrition-panel numbers (Open
-- Food Facts / Blinkit only, never AI-estimated). Run this once in the
-- Supabase SQL Editor (Project → SQL Editor → New query).
--
-- Kept as its own table, separate from product_reports.report (a jsonb
-- blob), specifically so this data is browsable/queryable directly in
-- the Supabase dashboard's table view instead of buried inside JSON --
-- the app itself still also keeps a copy on report.realNutrients (see
-- src/services/analyzeText.js), which is what Personal FoodGuard's
-- scoring (src/services/personalAssessment.js) actually reads at
-- runtime; this table is the human-visible, queryable record of the
-- same numbers, not a replacement read path.

create table if not exists public.product_nutrition (
  id uuid primary key default gen_random_uuid(),

  -- Same key product_reports.lookup_key uses ("barcode:8901..." or a
  -- text-hash key) -- one nutrition row per cached product.
  lookup_key text unique not null references public.product_reports (lookup_key) on delete cascade,
  product_name text,

  sodium_mg numeric,
  added_sugar_g numeric,
  saturated_fat_g numeric,
  trans_fat_g numeric,
  calories_kcal numeric,
  protein_g numeric,

  -- The real pack weight these numbers were scaled to when known
  -- (Open Food Facts' serving_size), or null when they're still the
  -- standard per-100g figures (always true for Blinkit today -- see
  -- blinkitProductsRepo.js's own comment on why).
  serving_grams numeric,

  source text not null,  -- 'openfoodfacts' | 'blinkit'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_nutrition_lookup_key_idx on public.product_nutrition (lookup_key);

-- Same RLS story as every other table here (schema.sql) -- no user
-- accounts, so the anon key needs open read/write for this to work at
-- all from the deployed app.
alter table public.product_nutrition enable row level security;

create policy "Anyone can read nutrition data"
  on public.product_nutrition for select
  using (true);

create policy "Anyone can insert nutrition data"
  on public.product_nutrition for insert
  with check (true);

create policy "Anyone can update nutrition data"
  on public.product_nutrition for update
  using (true);
