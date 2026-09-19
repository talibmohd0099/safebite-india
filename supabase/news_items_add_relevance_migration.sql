-- FoodGuard India -- adds an AI-checked relevance flag to news_items.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- fetchIndiaFoodNews() in fetch-news.js matches NewsData.io headlines on
-- broad keywords ("food safety", "FSSAI", "food recall"), which -- same
-- lesson as the PubMed query's own comment above PUBMED_QUERY -- pulls in
-- some genuinely unrelated articles that just happen to mention one of
-- those words (confirmed live: a "UPSC Key" current-affairs roundup
-- matched and was summarized by Gemini as "not related to food safety or
-- nutrition"). summarize-news.js now asks Gemini to flag this during the
-- same summarization call it already makes, and the News page only shows
-- rows this is explicitly true for -- a row stays hidden (not deleted)
-- until it's been checked, same as it stays hidden today while summary
-- is still null.
--
-- No default on purpose: every existing row starts NULL (unchecked, so
-- hidden) until summarize-news.js's next pass explicitly sets true/false.

alter table public.news_items add column if not exists is_relevant boolean;
