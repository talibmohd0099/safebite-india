// scripts/generate-daily-fact.js
//
// Runs once a day (.github/workflows/generate-daily-fact.yml) to
// generate the homepage's "Did you know?" fact fresh via Gemini,
// instead of only ever cycling the static curated list
// (src/data/didYouKnowTips.js). That list stays in place untouched as
// the fallback for any day this doesn't run, fails, or Gemini declines
// to answer -- see dailyFactRepo.js / Home.jsx.
//
// Usage:
//   node scripts/generate-daily-fact.js

import { generateDailyFact } from '../src/services/geminiService.js';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

async function main() {
  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: existing, error: readError } = await supabase
    .from('daily_facts')
    .select('fact_date')
    .eq('fact_date', today)
    .maybeSingle();
  if (readError) {
    console.error('Could not check for an existing fact:', readError.message);
    process.exitCode = 1;
    return;
  }
  if (existing) {
    console.log(`Already have a fact for ${today} -- nothing to do.`);
    return;
  }

  // Last 14 days' topics, so Gemini doesn't repeat itself week to week.
  const { data: recent } = await supabase
    .from('daily_facts')
    .select('short_fact')
    .order('fact_date', { ascending: false })
    .limit(14);

  const fact = await generateDailyFact((recent || []).map((r) => r.short_fact));
  if (!fact) {
    console.error("Gemini didn't return a usable fact today -- leaving the static rotation in place.");
    process.exitCode = 1;
    return;
  }

  const { error: writeError } = await supabase
    .from('daily_facts')
    .upsert({ fact_date: today, short_fact: fact.shortFact, detail: fact.detail }, { onConflict: 'fact_date' });
  if (writeError) {
    console.error("Could not save today's fact:", writeError.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Saved fact for ${today}: "${fact.shortFact}"`);
}

main();
