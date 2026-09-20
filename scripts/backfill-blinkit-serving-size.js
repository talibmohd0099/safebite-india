// scripts/backfill-blinkit-serving-size.js
//
// One-off backfill: every Blinkit report generated BEFORE
// extractNutrientsForHabitCheck learned to read pack_size (see
// blinkitProductsRepo.js) has realNutrientsServingGrams stuck at null --
// its Quick Health Check either never appeared, or silently fell back to
// "the standard per-100g figures" even for products with a real, known
// pack size. New reports pick this up automatically now (wired into
// generate-reports.js); this fixes the ones that already exist.
//
// Recomputes only the serving-size-driven parts (realNutrients*,
// dailyHabitCheck, and the score/verdict via applyRealNutrientCap, the
// same way a fresh report would) -- never calls Gemini again, since the
// ingredients/insights text this product already has is unchanged.
//
// Usage:
//   node scripts/backfill-blinkit-serving-size.js [--limit=10]

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { extractNutrientsForHabitCheck, blinkitLookupKey } from '../src/services/blinkitProductsRepo.js';
import { buildDailyHabitCheck, isSmallPortionFood } from '../src/services/dailyHabitCheck.js';
import { applyRealNutrientCap } from '../src/services/scoringEngine.js';
import { saveReport } from '../src/services/productCache.js';

async function main() {
  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 10;

  // Over-fetch candidates -- many will turn out to already be up to date
  // (backfilled already, or generated after the fix) or have nothing
  // usable, so the real limit is enforced on ACTUAL updates below, not
  // on this initial candidate list.
  const { data: candidates, error } = await supabase
    .from('blinkit_products')
    .select('id, source, brand, product_name, pack_size, nutrition')
    .not('pack_size', 'is', null)
    .not('nutrition', 'is', null)
    .order('scraped_at', { ascending: false })
    .limit(limit * 20);

  if (error) {
    console.error('Could not read blinkit_products:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Scanning ${candidates.length} candidate(s) for up to ${limit} update(s)...\n`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (updated >= limit) break;
    scanned += 1;

    const lookupKey = blinkitLookupKey(row.source, row.brand, row.product_name);
    const { data: existing } = await supabase
      .from('product_reports')
      .select('product_name, ingredients_text, report')
      .eq('lookup_key', lookupKey)
      .maybeSingle();

    if (!existing) { skipped += 1; continue; } // never generated a report at all
    const report = existing.report;
    if (report.realNutrientsServingGrams) { skipped += 1; continue; } // already has real serving data

    const nutrientsInfo = extractNutrientsForHabitCheck(row.nutrition, row.pack_size);
    if (!nutrientsInfo) { skipped += 1; continue; } // no usable nutrient numbers to begin with

    const before = { score: report.overallScore, verdict: report.verdict, hadHabitCheck: Boolean(report.dailyHabitCheck) };

    report.realNutrients = nutrientsInfo.nutrients;
    report.realNutrientsServingGrams = nutrientsInfo.servingGrams;
    report.realNutrientsServingUnit = nutrientsInfo.servingUnit;

    // Same gate as analyzeText.js's own real-nutrient-cap logic --
    // condiments/seasonings and infant formula are deliberately excluded
    // from the daily-habit framing.
    if (!report.isCondimentOrSeasoning && !report.isInfantFormula && !isSmallPortionFood(report.productName, nutrientsInfo.servingGrams)) {
      const habitCheck = buildDailyHabitCheck(nutrientsInfo.nutrients, nutrientsInfo.servingGrams, nutrientsInfo.servingUnit);
      if (habitCheck) {
        report.dailyHabitCheck = habitCheck;
        applyRealNutrientCap(report, habitCheck);
      }
    }

    await saveReport({ lookupKey, source: row.source, productName: existing.product_name, ingredientsText: existing.ingredients_text, report });
    updated += 1;

    const scoreChanged = before.score !== report.overallScore;
    console.log(
      `  ${row.product_name} | pack_size: ${row.pack_size} -> serving ${nutrientsInfo.servingGrams}${nutrientsInfo.servingUnit}` +
      ` | habit check: ${before.hadHabitCheck ? 'had one' : 'none'} -> ${report.dailyHabitCheck ? 'has one' : 'none'}` +
      (scoreChanged ? ` | SCORE CHANGED: ${before.score} (${before.verdict}) -> ${report.overallScore} (${report.verdict})` : ' | score unchanged')
    );
  }

  console.log(`\nScanned ${scanned} candidate(s). Updated ${updated}, skipped ${skipped} (already had real serving data, no report yet, or nothing usable).`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
