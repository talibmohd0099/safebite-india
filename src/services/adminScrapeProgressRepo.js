// src/services/adminScrapeProgressRepo.js
//
// Live visibility into the background Blinkit scrape + report-generation
// loop, for the admin "Scrape progress" page -- previously the only way
// to see this was asking Claude to check the local log file/database by
// hand. Every number here reads straight from the same tables the
// scraper/report-generator themselves write to, so it reflects the
// loop's real, current state, not a cached snapshot.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured.');
}

/**
 * Headline counters: total catalog size, and how much was added in the
 * last hour/today -- the fastest way to see "is this actually moving
 * right now" without reading a single log line.
 */
export async function adminScrapeOverview() {
  requireSupabase();

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalBlinkit, lastHour, today, totalReports, reportsToday, pendingReports] = await Promise.all([
    supabase.from('blinkit_products').select('*', { count: 'exact', head: true }),
    supabase.from('blinkit_products').select('*', { count: 'exact', head: true }).gte('scraped_at', hourAgo),
    supabase.from('blinkit_products').select('*', { count: 'exact', head: true }).gte('scraped_at', todayStart.toISOString()),
    supabase.from('product_reports').select('*', { count: 'exact', head: true }).eq('source', 'blinkit'),
    supabase.from('product_reports').select('*', { count: 'exact', head: true }).eq('source', 'blinkit').gte('created_at', todayStart.toISOString()),
    supabase.from('blinkit_products').select('*', { count: 'exact', head: true }).is('report_generated_at', null),
  ]);

  return {
    totalBlinkitProducts: totalBlinkit.count ?? 0,
    scrapedLastHour: lastHour.count ?? 0,
    scrapedToday: today.count ?? 0,
    totalBlinkitReports: totalReports.count ?? 0,
    reportsToday: reportsToday.count ?? 0,
    pendingReports: pendingReports.count ?? 0,
  };
}

/**
 * Per-category resume state -- ordered by most recently touched first,
 * so whichever categories the loop is actively working through right
 * now surface at the top on their own, no manual sorting needed.
 */
export async function adminScrapeCategoryProgress(limit = 30) {
  requireSupabase();
  const { data, error } = await supabase
    .from('blinkit_seed_progress')
    .select('category, next_index, exhausted, products_saved, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
