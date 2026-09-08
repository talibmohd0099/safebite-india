-- SafeBite India — the ingredient knowledge base.
--
-- The idea: every ingredient in the world gets researched by AI exactly
-- ONCE and stored here. After that, every scan containing that ingredient
-- is a pure database lookup — no AI call, no billing.
--
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),

  -- Normalized key we match scanned label text against, e.g. 'sucralose'.
  canonical_name text unique not null,
  display_name text not null,              -- 'Sucralose' (nicely cased, for the UI)

  ins_code text,                           -- '955'  (INS / E number, when it has one)
  scientific_name text,                    -- "Trichlorogalactosucrose"

  category text,                           -- 'sweetener' | 'preservative' | 'color' | ...
  status text not null,                    -- 'safe' | 'concerning' | 'harmful'
  fssai_status text,                       -- 'permitted' | 'restricted' | 'banned' | 'not_regulated'
  eu_status text,

  reason text,                             -- short plain-English concern summary
  what_is_it text,
  health_effects text,
  commonly_found_in jsonb default '[]'::jsonb,

  -- Alternate spellings/names this ingredient is written as on labels,
  -- e.g. ['e955','sucralose (955)','trichlorogalactosucrose'].
  synonyms jsonb default '[]'::jsonb,

  -- How harshly this ingredient pulls the product score down (0-40).
  -- Used later by the rule-based scoring engine so scores are computed
  -- in code instead of asking the AI to judge each product.
  penalty integer not null default 0,

  lookup_count integer not null default 0, -- how often we've served it from cache
  researched_at timestamptz not null default now()
);

create index if not exists ingredients_canonical_name_idx on public.ingredients (canonical_name);
create index if not exists ingredients_ins_code_idx on public.ingredients (ins_code);

-- Fast "is this one of the alternate spellings" lookups.
create index if not exists ingredients_synonyms_idx on public.ingredients using gin (synonyms);

alter table public.ingredients enable row level security;

create policy "Anyone can read ingredients"
  on public.ingredients for select
  using (true);

create policy "Anyone can add researched ingredients"
  on public.ingredients for insert
  with check (true);

create policy "Anyone can update ingredient stats"
  on public.ingredients for update
  using (true);
