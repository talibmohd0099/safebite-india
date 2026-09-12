// scripts/recompute-scores.js
//
// Re-scores every already-cached product_reports row from its already-
// resolved ingredients, using whatever the current scoring formula in
// scoringEngine.js is -- no Gemini calls, no re-fetching from Open Food
// Facts. This is exactly the "recompute everything for free" path the
// products/product_reports split was built to enable: run this any time
// the scoring formula changes, instead of re-seeding from scratch.
//
// Deliberately leaves `summary` untouched, and leaves `recommendation`
// untouched too whenever it's AI-written rather than the generic
// score-band fallback -- both are prose that already names this
// product's specific ingredients, and a changed score number alone
// doesn't make that text wrong. Overwriting either with buildReport's
// generic version would throw away real AI text for no reason.
//
// Usage:
//   node scripts/recompute-scores.js --dry-run
//   node scripts/recompute-scores.js

import { buildReport, isRuleBasedRecommendation } from '../src/services/scoringEngine.js';
import { parseLabel } from '../src/services/ingredientParser.js';
import { estimateQuantities } from '../src/services/quantityEstimator.js';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

/**
 * Re-parse a stored report's label text to recover the information that
 * only the parser knows -- which ingredients shared one bracket, and what
 * each one's estimated share of the product is -- and attach it to the
 * already-researched ingredient objects.
 *
 * Returns null if the parse no longer lines up with what's stored, in
 * which case the row is left alone rather than rescored against a
 * mismatched ingredient list.
 */
function withRederivedQuantities(stored, ingredientsText) {
  if (!ingredientsText) return null;

  const { ingredients: parsed } = parseLabel(ingredientsText);
  if (!parsed.length) return null;

  const withQty = estimateQuantities(parsed);
  const byName = new Map(withQty.map((p) => [p.displayName.toLowerCase(), p]));

  const out = [];
  for (const ingredient of stored) {
    const match = byName.get((ingredient.name || '').toLowerCase());
    if (!match) return null;
    out.push({
      ...ingredient,
      percentage: typeof match.percentage === 'number' ? match.percentage : ingredient.percentage,
      estimatedPercentage: match.estimatedPercentage,
    });
  }
  return out;
}

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
  let unmatched = 0;

  while (true) {
    // Ordered by id on purpose: this pages through the table WHILE
    // updating rows in it, and without a stable sort Postgres is free to
    // return rows in any order -- an updated row can move between pages
    // and simply never be visited. That silently skipped rows on an
    // earlier run (the same product still showed its old score after a
    // "successful" pass).
    const { data, error } = await supabase
      .from('product_reports')
      .select('id, product_name, ingredients_text, report')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Read failed:', error.message);
      process.exitCode = 1;
      return;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      checked++;
      const stored = row.report?.ingredients;
      if (!stored || stored.length === 0) continue;

      // Re-derive quantities from the label text rather than trusting the
      // stored ingredient objects: bracket grouping and the position-based
      // estimates live in the PARSER, so a row analysed before those
      // existed has no way to benefit otherwise. Penalties/status are
      // reused as-is, so this still costs nothing and calls no AI.
      const ingredients = withRederivedQuantities(stored, row.ingredients_text);
      if (!ingredients) { unmatched++; continue; }

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
          // Only refresh the recommendation when it's still the generic
          // score-band line -- an AI-written one is specific to this
          // product and would be thrown away by overwriting it here,
          // same reasoning as `summary` above.
          recommendation: isRuleBasedRecommendation(row.report.recommendation)
            ? fresh.recommendation
            : row.report.recommendation,
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
  if (unmatched > 0) {
    console.log(`${unmatched} left alone -- their label text no longer parses to the same ingredient list, so rescoring them would compare against the wrong thing.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
