-- FoodGuard India — user-reported problems with a product's report.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New
-- query).
--
-- Replaces the ad-hoc habit of editing a product's NAME to contain the
-- word "incorrect" to mark it for review: that corrupted the product
-- data itself (the word had to be stripped back out later), only one
-- bit of information fit in it, and it couldn't hold WHY something
-- looked wrong.

create table if not exists public.product_flags (
  id uuid primary key default gen_random_uuid(),

  -- Same key product_reports.lookup_key uses. Deliberately NOT a
  -- foreign key: a text- or photo-scanned product that was never
  -- written to the shared cache (see analyzeText.js's isIngredientOnly,
  -- and any scan the user hasn't saved) still deserves to be
  -- reportable, and a FK here would reject exactly those rows. Null
  -- when the scan has no cache key at all.
  lookup_key text,
  product_name text,

  -- 'score_too_high' | 'score_too_low' | 'wrong_ingredients'
  -- | 'wrong_product' | 'other'
  reason text not null,
  remarks text,

  -- The report AS THE PERSON SAW IT. The whole point of this column:
  -- a product gets re-analyzed the moment we fix whatever was wrong
  -- with it, and without a snapshot the report "score is too high"
  -- becomes unverifiable the instant it's acted on -- which is exactly
  -- what happened with the products flagged by renaming. Keeping the
  -- as-seen copy means a flag can still be read, and diffed against
  -- the current report, long after the fix.
  score_at_flag integer,
  verdict_at_flag text,
  report_snapshot jsonb,

  -- 'open' | 'resolved' -- triage state, so a reviewed flag can be
  -- closed out without deleting the record of it.
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists product_flags_status_idx on public.product_flags (status, created_at desc);
create index if not exists product_flags_lookup_key_idx on public.product_flags (lookup_key);

-- Same RLS story as every other table here (schema.sql) -- no user
-- accounts, so the anon key needs open read/write for this to work at
-- all from the deployed app. No delete policy, matching the other
-- tables: a flag is a record of something someone reported, and
-- resolving it is a status change, not an erasure.
alter table public.product_flags enable row level security;

create policy "Anyone can read flags"
  on public.product_flags for select
  using (true);

create policy "Anyone can submit a flag"
  on public.product_flags for insert
  with check (true);

create policy "Anyone can update a flag"
  on public.product_flags for update
  using (true);
