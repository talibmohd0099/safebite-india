-- SafeBite India — background seeder progress tracker.
--
-- The Netlify scheduled function (netlify/functions/seed-products.js)
-- walks through each Indian FMCG company's product list on Open Food
-- Facts one page at a time. This table remembers how far it got for each
-- company so a run picks up where the last one left off instead of
-- re-scanning from page 1 every time.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.seed_progress (
  company text primary key,
  next_page integer not null default 1,
  exhausted boolean not null default false,   -- true once we've been through every page for this company
  products_saved integer not null default 0,  -- running total, just for visibility
  updated_at timestamptz not null default now()
);

alter table public.seed_progress enable row level security;

create policy "Anyone can read seed progress"
  on public.seed_progress for select
  using (true);

create policy "Anyone can insert seed progress"
  on public.seed_progress for insert
  with check (true);

create policy "Anyone can update seed progress"
  on public.seed_progress for update
  using (true);
