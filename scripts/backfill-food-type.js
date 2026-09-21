// scripts/backfill-food-type.js
//
// Classifies every existing product_reports row (report.foodType /
// report.isDeepFried, keyword pass -- no Gemini) and applies the
// fried/dense-snack score ceiling from nutritionDensity.js. Free and
// re-runnable: the ceiling is always applied to the pre-ceiling score
// (overallScoreBeforeDensity when present), so running it twice, or after
// tuning the thresholds, never compounds.
//
// Rows an admin has classified by hand (report.foodTypeSource === 'admin')
// keep their type.
//
// Usage:
//   node scripts/backfill-food-type.js                    (dry run, prints summary + biggest changes)
//   node scripts/backfill-food-type.js --name=bhujia      (dry run, rows whose name contains this)
//   node scripts/backfill-food-type.js --csv=out.csv      (also dump every change)
//   add --write to save.

import fs from 'node:fs';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { classifyFoodType } from '../src/services/foodType.js';
import { applyNutritionDensityCeiling } from '../src/services/nutritionDensity.js';

const PAGE_SIZE = 500;
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const stable = (v) => JSON.stringify(v ?? null, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
    : x);

function reclassify(row) {
  const report = row.report || {};
  const next = { ...report };
  // Start from the score the ceiling has NOT touched, so re-runs are stable.
  if (typeof next.overallScoreBeforeDensity === 'number') next.overallScore = next.overallScoreBeforeDensity;
  delete next.overallScoreBeforeDensity;
  delete next.nutritionDensity;
  delete next.scoreNote;

  if (report.foodTypeSource !== 'admin') {
    const c = classifyFoodType({
      productName: report.productName || row.product_name,
      ingredientNames: (report.ingredients || []).map((i) => i.name),
    });
    next.foodType = c.foodType;
    next.isDeepFried = c.isDeepFried;
  }
  const beforeVerdict = next.verdict;
  applyNutritionDensityCeiling(next);
  if (typeof next.overallScoreBeforeDensity !== 'number') next.verdict = beforeVerdict === report.verdict ? report.verdict : beforeVerdict;
  return next;
}

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  const nameFilter = arg('name')?.toLowerCase();
  const csvPath = arg('csv');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  const types = {};
  const changes = [];
  let checked = 0;
  let failed = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from('product_reports').select('id, lookup_key, product_name, report').order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) { console.error('Read failed:', error.message); process.exitCode = 1; return; }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (nameFilter && !(row.product_name || '').toLowerCase().includes(nameFilter)) continue;
      if (!row.report || row.report.isInfantFormula) continue;
      checked++;
      const next = reclassify(row);
      types[next.foodType || 'none'] = (types[next.foodType || 'none'] || 0) + 1;
      if (stable(next) === stable(row.report)) continue;

      changes.push({
        id: row.id,
        name: row.product_name,
        type: next.foodType,
        fried: next.isDeepFried,
        before: row.report.overallScore,
        after: next.overallScore,
        hasData: !!next.nutritionDensity,
        note: next.scoreNote || '',
      });
      if (write) {
        const { error: writeError } = await supabase.from('product_reports').update({ report: next, updated_at: new Date().toISOString() }).eq('id', row.id);
        if (writeError) { failed++; console.warn(`could not save ${row.product_name}: ${writeError.message}`); }
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  const scoreChanged = changes.filter((c) => c.before !== c.after);
  console.log('Food types:', types);
  console.log(`\nChecked ${checked}. Rows changed: ${changes.length} (score changed: ${scoreChanged.length}, failed writes: ${failed}).`);
  const drop = scoreChanged.map((c) => c.before - c.after);
  if (drop.length) console.log(`Score change: avg -${(drop.reduce((a, b) => a + b, 0) / drop.length).toFixed(1)}, max -${Math.max(...drop)}`);
  console.log('\nBiggest score drops:');
  for (const c of [...scoreChanged].sort((a, b) => (b.before - b.after) - (a.before - a.after)).slice(0, nameFilter ? 40 : 15)) {
    console.log(`  ${String(c.before).padStart(3)} -> ${String(c.after).padStart(3)}  ${c.name}  [${c.type}${c.hasData ? '' : ', no nutrition data'}]`);
  }
  if (csvPath) {
    fs.writeFileSync(csvPath, 'name,foodType,isDeepFried,before,after,hasNutritionData\n' + changes.map((c) => `"${(c.name || '').replace(/"/g, '""')}",${c.type},${c.fried},${c.before},${c.after},${c.hasData}`).join('\n'));
    console.log(`\nWrote ${csvPath}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
