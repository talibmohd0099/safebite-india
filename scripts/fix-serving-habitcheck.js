// scripts/fix-serving-habitcheck.js
//
// A real bug found live: saved reports' serving size was sometimes the
// per-100g basis mislabelled as a serving (exactly 100), junk ("1 g"), or
// the whole PACK weight (openFoodFacts.js's product_quantity fallback -- a
// 400g family pack read as one serving). The Nutrition section and Quick
// Health Check then described that "serving", and because a Quick Health
// Check also caps the score (applyRealNutrientCap), some scores were
// capped on a serving nobody eats.
//
// analyzeText.js now re-decides the serving through servingResolver.js
// (REAL servings only -- label or single-serve pack, never the category
// estimate; no real serving = per 100g, as before). This applies the same
// rule to existing rows: recomputes realNutrients + dailyHabitCheck with
// exactly analyzeText.js's gates, and rescoring from the report's own
// already-resolved ingredients (never re-researches anything, no AI).
//
// The score is only rewritten when the fix itself changes it: the same
// pipeline is run with the OLD and the NEW habit check, and only a
// difference between those two counts -- so an unrelated drift between
// the stored score and today's formula is never smuggled in here.
//
// Usage:
//   node --env-file=.env scripts/fix-serving-habitcheck.js            (dry run)
//   node --env-file=.env scripts/fix-serving-habitcheck.js --write

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { buildReport, applyRealNutrientCap } from '../src/services/scoringEngine.js';
import { applyNutritionDensityCeiling } from '../src/services/nutritionDensity.js';
import { buildDailyHabitCheck, isSmallPortionFood } from '../src/services/dailyHabitCheck.js';
import { toServing } from '../src/services/nutrientBasis.js';
import { resolveServing } from '../src/services/servingResolver.js';

const PAGE_SIZE = 500;

async function readPage(from) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.from('product_reports').select('id, product_name, report').order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (!error) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Read failed at ${from}`);
}

// analyzeText.js's exact gate for a Quick Health Check.
function habitCheckFor(report, servingGrams, servingUnit, realNutrients) {
  const isSmallDoseType = report.foodType === 'condiment' || report.foodType === 'supplement';
  if (report.isCondimentOrSeasoning || report.isInfantFormula || isSmallDoseType) return null;
  if (isSmallPortionFood(report.productName, servingGrams)) return null;
  return buildDailyHabitCheck(realNutrients, servingGrams, servingUnit);
}

// analyzeText.js's scoring order: ingredients -> real-nutrient cap -> density ceiling.
function scoreWith(report, habitCheck) {
  const base = buildReport(report.ingredients, {
    productName: report.productName, brand: report.brand, imageUrl: report.imageUrl, packSize: report.packSize,
  });
  const next = { ...report, overallScore: base.overallScore, verdict: base.verdict };
  delete next.overallScoreBeforeDensity;
  delete next.nutritionDensity;
  delete next.scoreNote;
  if (habitCheck) applyRealNutrientCap(next, habitCheck);
  applyNutritionDensityCeiling(next);
  return next;
}

const describe = (h) => (h ? `${Math.round(h.percent)}% ${h.nutrientLabel}` : 'none');

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  let checked = 0, servingChanged = 0, habitChanged = 0, scoreChanged = 0, failed = 0;
  const scoreLines = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const data = await readPage(from);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const report = { ...row.report, productName: row.report?.productName || row.product_name };
      if (!report.nutrientsPer100) continue;
      checked++;

      const oldGrams = typeof report.realNutrientsServingGrams === 'number' ? report.realNutrientsServingGrams : null;
      const real = resolveServing(report, { allowStandard: false });
      const newGrams = real?.grams ?? null;
      const newUnit = real?.unit || 'g';
      if (newGrams === oldGrams) continue;
      servingChanged++;

      const realNutrients = toServing(report.nutrientsPer100, newGrams);
      const newHabit = habitCheckFor(report, newGrams, newUnit, realNutrients);
      const oldHabit = report.dailyHabitCheck || null;
      const habitDiffers = describe(oldHabit) !== describe(newHabit);
      if (habitDiffers) {
        habitChanged++;
        if (process.argv.includes("--verbose")) console.log(`  [check] ${row.product_name}: serving ${oldGrams ?? "per 100"} -> ${newGrams ?? "per 100"}${newUnit} | ${describe(oldHabit)} -> ${describe(newHabit)}`);
      }

      let next = { ...row.report, realNutrientsServingGrams: newGrams, realNutrientsServingUnit: newUnit, realNutrients };
      if (newHabit) next.dailyHabitCheck = newHabit; else delete next.dailyHabitCheck;

      if (Array.isArray(report.ingredients) && report.ingredients.length > 0 && !!oldHabit !== !!newHabit) {
        const before = scoreWith(report, oldHabit);
        const after = scoreWith(report, newHabit);
        if (before.overallScore !== after.overallScore) {
          scoreChanged++;
          next = { ...after, ...next, overallScore: after.overallScore, verdict: after.verdict };
          for (const k of ['overallScoreBeforeDensity', 'nutritionDensity', 'scoreNote']) {
            if (k in after) next[k] = after[k]; else delete next[k];
          }
          scoreLines.push(`  ${row.product_name}: serving ${oldGrams ?? 'per 100'} -> ${newGrams ?? 'per 100'}${newUnit} | check ${describe(oldHabit)} -> ${describe(newHabit)} | score ${report.overallScore} -> ${next.overallScore}`);
        }
      }

      if (write) {
        const { error: writeError } = await supabase.from('product_reports').update({ report: next, updated_at: new Date().toISOString() }).eq('id', row.id);
        if (writeError) { failed++; console.warn(`    could not save ${row.product_name}: ${writeError.message}`); }
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  console.log(scoreLines.join('\n'));
  console.log(`\nChecked ${checked} rows with real nutrition data.`);
  console.log(`Serving size corrected: ${servingChanged}. Quick Health Check changed: ${habitChanged}. Score changed: ${scoreChanged}.`);
  if (write) console.log(`Failed writes: ${failed}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
