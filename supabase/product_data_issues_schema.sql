-- FoodGuard India — data-quality issues found by the audit scripts
-- (scripts/fix-sodium-outliers.js and friends), where the number in
-- product_reports was checked against its real source and genuinely
-- couldn't be resolved automatically -- e.g. Open Food Facts' own live
-- data still shows an implausible figure, or a barcode looks like it's
-- matched to the wrong product entirely. Run this once in the Supabase
-- SQL Editor (Project → SQL Editor → New query).
--
-- Deliberately a SEPARATE table from product_flags: that one is a real
-- person reporting "this looks wrong" from the app; this one is the
-- audit tooling itself saying "I checked this against its source and
-- still can't tell what the right number is" -- different origin,
-- different reason vocabulary (a free-text explanation of what was
-- checked and why it's still unresolved, not a fixed complaint category).

create table if not exists public.product_data_issues (
  id uuid primary key default gen_random_uuid(),

  -- Same key product_reports.lookup_key uses. Not a foreign key, same
  -- reasoning as product_flags -- the row this points at can be deleted
  -- or re-keyed later without silently breaking this record.
  lookup_key text,
  product_name text,
  source text, -- 'barcode' | 'blinkit' | ... (product_reports.source at detection time)

  -- What's actually wrong, in plain terms an admin can act on without
  -- re-running any script themselves.
  nutrient text,             -- e.g. 'sodium', 'calories' -- the field in question, null if not nutrient-specific
  current_value numeric,
  unit text,
  reason text not null,      -- why this needs a human -- what was checked, what was found, what's still unclear

  score_at_detection integer,
  verdict_at_detection text,

  -- 'open' | 'resolved' -- same triage lifecycle as product_flags.
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists product_data_issues_status_idx on public.product_data_issues (status, detected_at desc);
create index if not exists product_data_issues_lookup_key_idx on public.product_data_issues (lookup_key);

-- Same RLS story as every other table here -- no user accounts, so the
-- anon key needs open read/write for the admin panel to work at all.
alter table public.product_data_issues enable row level security;

create policy "Anyone can read data issues"
  on public.product_data_issues for select
  using (true);

create policy "Anyone can insert a data issue"
  on public.product_data_issues for insert
  with check (true);

create policy "Anyone can update a data issue"
  on public.product_data_issues for update
  using (true);
