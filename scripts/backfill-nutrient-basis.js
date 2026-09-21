// scripts/backfill-nutrient-basis.js
//
// Gives every existing product_reports row the canonical per-100 g/ml
// nutrient basis (report.nutrientsPer100 -- see nutrientBasis.js) and
// repairs rows whose realNutrients were labelled with the wrong basis:
//   * Blinkit rows: rebuilt from blinkit_products.nutrition (per-100) +
//     serving_size, the real source of truth -- fixes the per-100 numbers
//     that were labelled "per {serving}".
//   * Admin rows with a typed nutritionPanel (always per-100): realNutrients
//     re-scaled to the serving.
//   * Everything else (Open Food Facts, older rows): per-100 derived from
//     realNutrients by dividing the serving back out.
// No Gemini calls, no scoring changes -- scores are recomputed separately
// (Stage 3). Safe to re-run: rows that already have nutrientsPer100 and a
// consistent basis are skipped.
//
// Usage:
//   node scripts/backfill-nutrient-basis.js                     (dry run, everything)
//   node scripts/backfill-nutrient-basis.js --keys=a,b          (dry run, only these lookup_keys)
//   node scripts/backfill-nutrient-basis.js --name=unibic       (dry run, product_name contains)
//   add --write to actually save.

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { blinkitLookupKey, extractNutrientsForHabitCheck } from '../src/services/blinkitProductsRepo.js';
import { getNutrientsPer100, panelToReportKeys, toServing } from '../src/services/nutrientBasis.js';
import { buildDailyHabitCheck, isSmallPortionFood } from '../src/services/dailyHabitCheck.js';

const PAGE_SIZE = 500;
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

async function loadBlinkitIndex() {
  const index = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('blinkit_products')
      .select('id, source, product_name, brand, nutrition, serving_size')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`blinkit_products: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.nutrition && Object.keys(row.nutrition).length > 0) {
        index.set(blinkitLookupKey(row.source, row.brand, row.product_name), row);
      }
    }
    if (data.length < 1000) break;
  }
  return index;
}

// Postgres jsonb hands keys back in its own order, so compare with sorted
// keys -- plain JSON.stringify made every already-fixed row look changed.
const stable = (v) => JSON.stringify(v ?? null, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
    : x);
const same = (a, b) => stable(a) === stable(b);

/** Returns { report, note } with the repaired report, or null when nothing needs to change. */
function repair(row, blinkitIndex) {
  const report = row.report || {};
  const next = { ...report };
  let note = '';

  const blinkit = blinkitIndex.get(row.lookup_key);
  const ex = blinkit ? extractNutrientsForHabitCheck(blinkit.nutrition, blinkit.serving_size) : null;

  if (ex) {
    next.realNutrients = ex.nutrients;
    next.nutrientsPer100 = ex.nutrientsPer100;
    next.realNutrientsServingGrams = ex.servingGrams ?? null;
    next.realNutrientsServingUnit = ex.servingUnit || 'g';
    note = 'blinkit';
  } else if (report.realNutrients || report.nutritionPanel) {
    const per100 = getNutrientsPer100(report);
    if (!per100) return null;
    next.nutrientsPer100 = per100;
    // A typed (per-100) admin panel was treated as already scaled -- bring
    // realNutrients back in line with the serving it is labelled with.
    if (report.nutritionPanel && panelToReportKeys(report.nutritionPanel) && report.realNutrientsServingGrams) {
      next.realNutrients = toServing(per100, report.realNutrientsServingGrams);
      note = 'admin-panel';
    } else {
      note = 'derived';
    }
  } else {
    return null;
  }

  // The daily-habit block is computed from the per-serving numbers, so
  // it has to follow them. Same gates as analyzeText.js.
  if (report.dailyHabitCheck !== undefined || note === 'blinkit') {
    const eligible = !report.isCondimentOrSeasoning && !report.isInfantFormula
      && !isSmallPortionFood(report.productName, next.realNutrientsServingGrams);
    const habit = eligible && next.realNutrients
      ? buildDailyHabitCheck(next.realNutrients, next.realNutrientsServingGrams, next.realNutrientsServingUnit || 'g')
      : null;
    if (habit) next.dailyHabitCheck = habit; else delete next.dailyHabitCheck;
  }

  if (same(next, report)) return null;
  return { report: next, note };
}

async function main() {
  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }
  const write = process.argv.includes('--write');
  const keys = arg('keys')?.split(',').map((k) => k.trim()).filter(Boolean);
  const nameFilter = arg('name')?.toLowerCase();

  const blinkitIndex = await loadBlinkitIndex();
  console.log(`Loaded ${blinkitIndex.size} Blinkit rows with nutrition data. Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  const counts = { checked: 0, changed: 0, skipped: 0, failed: 0 };
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from('product_reports').select('id, lookup_key, product_name, report').order('id', { ascending: true });
    if (keys) query = query.in('lookup_key', keys);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) { console.error('Read failed:', error.message); process.exitCode = 1; return; }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (nameFilter && !(row.product_name || '').toLowerCase().includes(nameFilter)) continue;
      counts.checked++;
      const result = repair(row, blinkitIndex);
      if (!result) { counts.skipped++; continue; }
      counts.changed++;

      const before = row.report?.realNutrients;
      const after = result.report.realNutrients;
      if (keys || nameFilter || counts.changed <= 25) {
        console.log(`${row.product_name} [${result.note}] serving=${result.report.realNutrientsServingGrams ?? '-'}`);
        console.log(`   kcal stored ${before?.caloriesKcal ?? '-'} -> ${after?.caloriesKcal ?? '-'} | per100 ${result.report.nutrientsPer100?.caloriesKcal ?? '-'} | sodium ${before?.sodiumMg ?? '-'} -> ${after?.sodiumMg ?? '-'}`);
      }
      if (write) {
        const { error: writeError } = await supabase
          .from('product_reports')
          .update({ report: result.report, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (writeError) { counts.failed++; console.warn(`   could not save: ${writeError.message}`); }
      }
    }
    if (keys || data.length < PAGE_SIZE) break;
  }
  console.log(`\nChecked ${counts.checked}, would change/changed ${counts.changed}, unchanged ${counts.skipped}, failed ${counts.failed}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
