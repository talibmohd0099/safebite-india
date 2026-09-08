-- SafeBite India — shared product cache
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).

create table if not exists public.product_reports (
  id uuid primary key default gen_random_uuid(),

  -- How we identify "the same product" so repeat scans reuse this row
  -- instead of calling the AI again: the barcode when we have one,
  -- otherwise a hash of the normalized ingredients text.
  lookup_key text unique not null,

  source text not null,              -- 'barcode' | 'photo' | 'text'
  product_name text,
  ingredients_text text not null,    -- the confirmed text the report was generated from
  report jsonb not null,             -- full AI analysis result (score, verdict, ingredients, etc.)

  scan_count integer not null default 1,  -- how many times this cached result has been served
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_reports_lookup_key_idx on public.product_reports (lookup_key);

-- Row Level Security: this table is read/written by the public app using
-- the anon key, so we open it up for our own use case (no user accounts
-- yet — everyone shares the same product cache, which is the whole point).
alter table public.product_reports enable row level security;

create policy "Anyone can read cached reports"
  on public.product_reports for select
  using (true);

create policy "Anyone can insert cached reports"
  on public.product_reports for insert
  with check (true);

create policy "Anyone can update scan_count"
  on public.product_reports for update
  using (true);
