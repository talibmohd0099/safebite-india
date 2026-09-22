// scripts/fix-serving-basis-outliers.js
//
// A different bug from the sodium-unit one: some Open Food Facts entries
// have their calorie (and other nutrient) figures ALREADY correct as a
// per-100g reading, but OFF's own site scaled them UP again as if they
// were a per-SERVING reading -- e.g. Britannia Nice's live OFF entry has
// energy-kcal_100g: 3561.5, but its OWN serving_size is "13g (approx 2
// biscuits)" and 463kcal for 13g of biscuit is exactly what you'd expect
// if 463 were actually meant as the per-100g figure (463kcal/100g is a
// completely ordinary biscuit calorie count) and got compounded by
// 100/13 on top of that.
//
// Verified per-product, never guessed: only applies when (a) the current
// per-100 calorie figure is physically impossible for any food (>900kcal,
// pure fat's own ceiling) and (b) the stored per-SERVING figure, taken
// AS a per-100g reading instead, is itself a normal, believable calorie
// count. When both hold, this stops scaling the serving up at all --
// nutrientsPer100 becomes what was stored as "per serving", and a fresh,
// correctly-scaled per-serving figure is derived back down from that.
//
// Usage:
//   node scripts/fix-serving-basis-outliers.js            (dry run)
//   node scripts/fix-serving-basis-outliers.js --write

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { toServing } from '../src/services/nutrientBasis.js';
import { buildDailyHabitCheck, isSmallPortionFood } from '../src/services/dailyHabitCheck.js';
import { buildReport, applyRealNutrientCap } from '../src/services/scoringEngine.js';
import { applyNutritionDensityCeiling } from '../src/services/nutritionDensity.js';

// Confirmed live against Open Food Facts -- each one's OWN OFF entry
// still carries the compounded figure at the time this was written.
const REPORT_IDS = [
  'd8cf7dcb-09cc-48e4-8fe7-f0843ee8b977', // Britannia Nice
  'd2d48a01-6eb8-4448-aacb-7e24a47d1847', // Puff choco vanilla flavoured sandwich biscuits
  'a3eb533f-8580-4853-8107-6004943b801b', // Navratan mix
  '07a4f540-feb5-467d-8676-bccdda2f6039', // Kellogg's Muesli Fruit, Nut & Seeds
];

const MAX_PLAUSIBLE_CALORIES_PER_100G = 900; // pure fat's real ceiling is ~884-900
const MIN_PLAUSIBLE_CALORIES_PER_100G = 20; // rules out a near-empty/placeholder reading

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  let fixed = 0, skipped = 0;

  for (const id of REPORT_IDS) {
    const { data: row, error } = await supabase.from('product_reports').select('id, product_name, report').eq('id', id).maybeSingle();
    if (error || !row) { console.warn(`  SKIP ${id}: could not load (${error?.message || 'not found'})`); continue; }

    const report = row.report;
    const currentPer100Cal = report.nutrientsPer100?.caloriesKcal;
    const perServingCal = report.realNutrients?.caloriesKcal;
    const servingGrams = report.realNutrientsServingGrams;

    if (typeof currentPer100Cal !== 'number' || currentPer100Cal <= MAX_PLAUSIBLE_CALORIES_PER_100G) {
      console.log(`  SKIP  ${row.product_name}  -- current per-100 calories (${currentPer100Cal}) isn't in the impossible range; needs its own check`);
      skipped++;
      continue;
    }
    if (typeof perServingCal !== 'number' || perServingCal < MIN_PLAUSIBLE_CALORIES_PER_100G || perServingCal > MAX_PLAUSIBLE_CALORIES_PER_100G || !servingGrams) {
      console.log(`  SKIP  ${row.product_name}  -- stored per-serving figure (${perServingCal}) isn't a believable per-100g reading either; needs manual review`);
      skipped++;
      continue;
    }

    // The stored "per serving" nutrients ARE the real per-100 figures --
    // stop scaling them up, and derive a correctly-scaled per-serving
    // figure back down from that instead.
    const nextPer100 = { ...report.realNutrients };
    const nextRealNutrients = toServing(nextPer100, servingGrams);

    const next = { ...report, nutrientsPer100: nextPer100, realNutrients: nextRealNutrients };

    const eligible = !next.isCondimentOrSeasoning && !next.isInfantFormula
      && !isSmallPortionFood(next.productName, servingGrams);
    const habitCheck = eligible ? buildDailyHabitCheck(nextRealNutrients, servingGrams, next.realNutrientsServingUnit || 'g') : null;
    if (habitCheck) next.dailyHabitCheck = habitCheck; else delete next.dailyHabitCheck;

    if (Array.isArray(report.ingredients) && report.ingredients.length > 0) {
      const baseline = buildReport(report.ingredients, {
        productName: report.productName, brand: report.brand, imageUrl: report.imageUrl, packSize: report.packSize,
      });
      next.overallScore = baseline.overallScore;
      next.verdict = baseline.verdict;
      delete next.overallScoreBeforeDensity;
      delete next.nutritionDensity;
      delete next.scoreNote;
      if (habitCheck) applyRealNutrientCap(next, habitCheck);
      if (next.foodType) applyNutritionDensityCeiling(next);
    }

    console.log(`  FIXED ${row.product_name}  calories/100g ${currentPer100Cal} -> ${nextPer100.caloriesKcal}  |  per-${servingGrams}g-serving now ${nextRealNutrients.caloriesKcal} (was ${perServingCal})  |  score ${report.overallScore} -> ${next.overallScore}`);
    fixed++;

    if (write) {
      const { error: writeError } = await supabase.from('product_reports').update({ report: next, updated_at: new Date().toISOString() }).eq('id', id);
      if (writeError) console.warn(`    could not save: ${writeError.message}`);
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, skipped: ${skipped}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
