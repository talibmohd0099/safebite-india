-- SafeBite India — cached news/research items for the News page.
--
-- Populated by scripts/fetch-news.js on a schedule (PubMed for genuine
-- nutrition/food-safety research; a news API for India food headlines,
-- once configured). The app reads only from this table -- it never
-- calls PubMed or a news API directly from a visitor's browser, so a
-- slow or rate-limited upstream source never affects page load.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('news', 'research')),
  title text not null,
  link text not null unique,
  source text,
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);

create index if not exists news_items_type_published_idx
  on public.news_items (type, published_at desc);

alter table public.news_items enable row level security;

create policy "Anyone can read news items"
  on public.news_items for select
  using (true);

create policy "Anyone can insert news items"
  on public.news_items for insert
  with check (true);

create policy "Anyone can update news items"
  on public.news_items for update
  using (true);
