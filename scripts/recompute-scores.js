// scripts/recompute-scores.js
//
// Re-scores every already-cached product_reports row from its already-
// resolved ingredients, using whatever the current scoring formula in
// scoringEngine.js is -- no Gemini calls, no re-fetching from Open Food
// Facts. This is exactly the "recompute everything for free" path the
// products/product_reports split was built to enable: run this any time
// the scoring formula changes, instead of re-seeding from scratch.
//
// Deliberately leaves `summary` untouched -- it's AI-written prose that
// already names specific ingredients; a changed score number alone
// doesn't make that text wrong, and overwriting it with buildReport's
// generic rule-based fallback would throw away a real AI summary for
// no reason.
//
// Usage:
//   node scripts/recompute-scores.js --dry-run
//   node scripts/recompute-scores.js

import { buildReport } from '../src/services/scoringEngine.js';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

const PAGE_SIZE = 500;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  let from = 0;
  let checked = 0;
  let changed = 0;

  while (true) {
    const { data, error } = await supabase
      .from('product_reports')
      .select('id, product_name, report')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Read failed:', error.message);
      process.exitCode = 1;
      return;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      checked++;
      const ingredients = row.report?.ingredients;
      if (!ingredients || ingredients.length === 0) continue;

      const fresh = buildReport(ingredients, {
        productName: row.report.productName,
        brand: row.report.brand,
        imageUrl: row.report.imageUrl,
      });

      const oldScore = row.report.overallScore;
      if (fresh.overallScore === oldScore && fresh.verdict === row.report.verdict) continue;

      changed++;
      console.log(`  ${row.product_name}: ${oldScore} -> ${fresh.overallScore} (${row.report.verdict} -> ${fresh.verdict})`);

      if (!dryRun) {
        const updatedReport = {
          ...row.report,
          overallScore: fresh.overallScore,
          verdict: fresh.verdict,
          recommendation: fresh.recommendation,
          flags: fresh.flags,
          positives: fresh.positives,
          hasEstimatedQuantities: fresh.hasEstimatedQuantities,
        };
        const { error: writeError } = await supabase
          .from('product_reports')
          .update({ report: updatedReport, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (writeError) console.warn(`    Could not save: ${writeError.message}`);
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`\nChecked ${checked} report(s), ${changed} changed${dryRun ? ' (dry run -- nothing written)' : ''}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
