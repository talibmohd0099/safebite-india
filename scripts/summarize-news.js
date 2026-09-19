// scripts/summarize-news.js
//
// Runs after fetch-news.js (.github/workflows/summarize-news.yml) to give
// every news_items row that doesn't have one yet a short, plain-language
// AI summary via Gemini -- see summarizeNewsItems() in geminiService.js.
// A bare PubMed title or news headline isn't very readable on its own;
// the News page leads with this summary instead, keeping the original
// link as "Read the full article/paper".
//
// Deliberately its own script/schedule rather than folded into
// fetch-news.js: fetch-news.js re-upserts the same recent items every
// run (cheap, no AI cost), while this only ever processes rows that are
// genuinely new (summary is null), so a slow/failed Gemini call here
// never blocks tomorrow's fetch.
//
// Usage:
//   node scripts/summarize-news.js

import { summarizeNewsItems } from '../src/services/geminiService.js';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

// One Gemini call summarizes this many rows at once (see
// summarizeNewsItems's batching comment) -- capped so a single run can't
// build an unbounded prompt if a backlog ever piles up.
const BATCH_SIZE = 20;

async function main() {
  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  const { data: pending, error: readError } = await supabase
    .from('news_items')
    .select('id, type, title, source, source_excerpt')
    .or('summary.is.null,is_relevant.is.null')
    .order('fetched_at', { ascending: false })
    .limit(BATCH_SIZE);

  if (readError) {
    console.error('Could not read pending news items:', readError.message);
    process.exitCode = 1;
    return;
  }

  if (!pending || pending.length === 0) {
    console.log('Nothing to summarize -- every item already has a summary.');
    return;
  }

  console.log(`Summarizing ${pending.length} item(s)...`);
  const summaries = await summarizeNewsItems(pending);

  if (summaries.length === 0) {
    console.error("Gemini didn't return any usable summaries this run.");
    process.exitCode = 1;
    return;
  }

  let saved = 0;
  let excluded = 0;
  for (const { id, relevant, summary } of summaries) {
    const { error } = await supabase.from('news_items').update({ summary, is_relevant: relevant }).eq('id', id);
    if (error) {
      console.error(`  Failed to save result for ${id}:`, error.message);
      continue;
    }
    saved += 1;
    if (!relevant) excluded += 1;
  }

  console.log(`Processed ${saved}/${pending.length} item(s), ${excluded} flagged not relevant and hidden.`);
  if (saved < pending.length) {
    console.log(`${pending.length - saved} item(s) left unprocessed -- will retry on the next run.`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
