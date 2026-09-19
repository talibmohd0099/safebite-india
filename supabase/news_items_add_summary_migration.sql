-- FoodGuard India -- adds AI-generated plain-language summaries to news_items.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- scripts/fetch-news.js only ever stored the raw title/link/source of each
-- PubMed research paper or India food-news headline -- fine as a pointer,
-- but a dense academic title or a bare headline isn't very readable on its
-- own for a general audience. scripts/summarize-news.js (new) asks Gemini
-- to write a short plain-language summary for each item that doesn't have
-- one yet, so the News page can lead with that instead of the raw title,
-- keeping the original link as "Read the full article/paper".
--
-- source_excerpt holds whatever extra source text was available to
-- summarize from (currently: a NewsData.io article's own description
-- snippet, when the news-headline feed is connected -- see
-- fetchIndiaFoodNews() in fetch-news.js). Nullable and empty for research
-- items today, kept so a future, richer source can feed the same column
-- without another migration.

alter table public.news_items add column if not exists summary text;
alter table public.news_items add column if not exists source_excerpt text;
