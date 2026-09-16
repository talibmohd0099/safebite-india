-- FoodGuard India — the homepage "Did you know?" card's daily fact,
-- generated once a day by scripts/generate-daily-fact.js (see
-- .github/workflows/generate-daily-fact.yml). Run once in the
-- Supabase SQL Editor (Project → SQL Editor → New query).
--
-- The static curated list (src/data/didYouKnowTips.js) stays in place
-- as the fallback for any day this table has no row for -- the job
-- hasn't run yet, Gemini declined to answer, or a save failed. A wrong
-- "fun fact" is worse than none, so nothing here is ever required for
-- the card to render something true.

create table if not exists public.daily_facts (
  id uuid primary key default gen_random_uuid(),

  -- One row per calendar day -- the upsert in generate-daily-fact.js
  -- targets this so a re-run on the same day updates in place instead
  -- of creating a duplicate.
  fact_date date unique not null,

  -- The one-line "Did you know?" text shown on the home screen card.
  short_fact text not null,
  -- The longer explanation shown behind "Learn more" -- context/nuance
  -- that doesn't fit in one line, not a restatement of short_fact.
  detail text not null,

  created_at timestamptz not null default now()
);

create index if not exists daily_facts_fact_date_idx on public.daily_facts (fact_date desc);

-- Same RLS story as every other table here (schema.sql) -- no user
-- accounts, so the anon key needs open read/write for this to work at
-- all from the deployed app and from the scheduled workflow.
alter table public.daily_facts enable row level security;

create policy "Anyone can read daily facts"
  on public.daily_facts for select
  using (true);

create policy "Anyone can insert daily facts"
  on public.daily_facts for insert
  with check (true);

create policy "Anyone can update daily facts"
  on public.daily_facts for update
  using (true);
