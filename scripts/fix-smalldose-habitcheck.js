// scripts/fix-smalldose-habitcheck.js
//
// A real bug found live: an electrolyte hydration mix (foodType never
// classified, isCondimentOrSeasoning never set -- Gemini's insights call
// hadn't run/returned for it) showed "891% of your daily sodium limit" in
// Quick Health Check, because dailyHabitCheck treats it as if 100g were
// eaten like a normal snack, when it's actually a powder reconstituted in
// water. analyzeText.js's gate now also excludes foodType 'condiment'/
// 'supplement' (see its own comment) -- this fixes existing rows that were
// scored BEFORE that gate existed or before their foodType was known
// (run scripts/backfill-food-type.js first so foodType is current).
//
// Removes any dailyHabitCheck that shouldn't exist under the current gate,
// then rescoring from the report's own already-resolved ingredients (never
// re-researches anything) to undo whatever nutrient-cap squeeze the stale
// habit check had applied.
//
// Usage:
//   node scripts/fix-smalldose-habitcheck.js            (dry run)
//   node scripts/fix-smalldose-habitcheck.js --write

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { buildReport } from '../src/services/scoringEngine.js';
import { applyNutritionDensityCeiling } from '../src/services/nutritionDensity.js';

const PAGE_SIZE = 500;

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  let checked = 0, fixed = 0, failed = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from('product_reports').select('id, product_name, report').order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) { console.error('Read failed:', error.message); process.exitCode = 1; return; }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const report = row.report;
      if (!report?.dailyHabitCheck) continue;
      checked++;

      const shouldBeSmallDose = report.isCondimentOrSeasoning || report.foodType === 'condiment' || report.foodType === 'supplement';
      if (!shouldBeSmallDose) continue; // habit check is legitimate under the current gate -- leave it

      const next = { ...report };
      delete next.dailyHabitCheck;

      if (Array.isArray(report.ingredients) && report.ingredients.length > 0) {
        const baseline = buildReport(report.ingredients, {
          productName: report.productName, brand: report.brand, imageUrl: report.imageUrl, packSize: report.packSize,
        });
        next.overallScore = baseline.overallScore;
        next.verdict = baseline.verdict;
        delete next.overallScoreBeforeDensity;
        delete next.nutritionDensity;
        delete next.scoreNote;
        if (next.foodType) applyNutritionDensityCeiling(next);
      }

      console.log(`  ${row.product_name}  [${report.foodType || (report.isCondimentOrSeasoning ? 'isCondimentOrSeasoning' : '?')}]  had ${report.dailyHabitCheck.percent}% ${report.dailyHabitCheck.nutrientLabel}  |  score ${report.overallScore} -> ${next.overallScore}`);
      fixed++;

      if (write) {
        const { error: writeError } = await supabase.from('product_reports').update({ report: next, updated_at: new Date().toISOString() }).eq('id', row.id);
        if (writeError) { failed++; console.warn(`    could not save: ${writeError.message}`); }
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\nChecked ${checked} rows with a dailyHabitCheck. Fixed ${fixed} (failed writes: ${failed}).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
