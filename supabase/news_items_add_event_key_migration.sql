-- FoodGuard India -- adds a story-clustering key to news_items.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Real problem confirmed live: the India food news feed showed 7+
-- separate cards for outlets all covering the exact same event (FSSAI's
-- legal action against Nestle over infant formula) -- technically
-- different publishers, but the same story to a reader. summarize-news.js
-- now asks Gemini to assign matching items the same event_key (a short
-- slug) when they're clearly about the same real-world event WITHIN the
-- batch it's given; News.jsx groups by this key into one card with a
-- source count instead of one card per publisher.
--
-- To cluster across days too (a story still being covered a day or two
-- later, not just same-day duplicate coverage), summarize-news.js also
-- passes Gemini a list of recently-used event_keys with one representative
-- title each, so a new matching item can reuse an existing key instead of
-- only ever matching within its own batch -- same pattern as
-- generateDailyFact's avoidTopics.

alter table public.news_items add column if not exists event_key text;
