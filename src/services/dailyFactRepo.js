// src/services/dailyFactRepo.js
//
// Reads today's AI-generated "Did you know?" fact (see
// scripts/generate-daily-fact.js / supabase/daily_facts_schema.sql).
// Deliberately just a read -- the app never generates or saves a fact
// itself, only the scheduled script does, so there's exactly one path
// that can write something wrong here, not two.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

/**
 * Today's fact, or null if there isn't one yet (the daily job hasn't
 * run, Gemini declined to answer, or Supabase isn't configured) --
 * callers fall back to the static curated rotation (didYouKnowTips.js)
 * in that case, never to a blank card.
 */
export async function getTodaysFact() {
  if (!isSupabaseConfigured) return null;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, local calendar day is close enough for a once-a-day fact

  const { data, error } = await supabase
    .from('daily_facts')
    .select('short_fact, detail')
    .eq('fact_date', today)
    .maybeSingle();

  if (error || !data) return null;
  return { shortFact: data.short_fact, detail: data.detail };
}
