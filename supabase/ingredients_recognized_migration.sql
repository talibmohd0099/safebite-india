-- SafeBite India — flag ingredients that aren't real food substances.
--
-- Previously, researching a made-up or non-food input (a typo, a random
-- word, someone's name) forced Gemini into "safe | concerning | harmful"
-- anyway, since there was no other option -- it would explain in plain
-- English that the input wasn't a real ingredient, but the app still
-- showed a full numeric score for it. This column lets Gemini say so
-- explicitly, and the app now refuses to score anything flagged false
-- (see src/services/analyzeText.js).
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.ingredients
  add column if not exists recognized boolean not null default true;
