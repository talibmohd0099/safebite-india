-- FoodGuard India -- adds confidence + evidence type to the ingredient
-- knowledge base, so the "Why did this score X?" breakdown can show how
-- sure we are about a claim, not just the claim itself. Purely additive:
-- existing rows get NULL until they're next researched or re-analyzed,
-- no backfill required -- the UI already only shows this line when both
-- fields are present (see Result.jsx).
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.ingredients add column if not exists confidence text;       -- 'high' | 'medium' | 'low'
alter table public.ingredients add column if not exists evidence_type text;    -- 'regulatory' | 'scientific_consensus' | 'limited_evidence' | 'heuristic'
