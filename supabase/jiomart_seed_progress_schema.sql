-- SafeBite India — JioMart scheduled-scrape progress tracker.
--
-- scripts/scrape-jiomart.js walks each category's sitemap a few products
-- at a time. This table remembers how far into each category it got, so
-- a run picks up where the last one stopped instead of re-fetching the
-- same first few products for ever. Mirrors blinkit_seed_progress.
--
-- Run this once in the Supabase SQL Editor.

create table if not exists public.jiomart_seed_progress (
  category text primary key,
  sitemap_url text not null,
  next_index integer not null default 0,    -- position reached in that category's sitemap
  exhausted boolean not null default false, -- true once every product has been visited
  products_saved integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.jiomart_seed_progress enable row level security;

create policy "Anyone can read jiomart seed progress"
  on public.jiomart_seed_progress for select
  using (true);

create policy "Anyone can insert jiomart seed progress"
  on public.jiomart_seed_progress for insert
  with check (true);

create policy "Anyone can update jiomart seed progress"
  on public.jiomart_seed_progress for update
  using (true);
