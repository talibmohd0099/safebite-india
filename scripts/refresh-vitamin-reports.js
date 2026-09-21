// scripts/refresh-vitamin-reports.js
//
// Re-analyzes saved reports whose ingredient list lost vitamins to the old
// parser bug ("Vitamin A & Vitamin D", "Vitamins (A, D & B12)" -- see
// expandVitaminShorthand in ingredientParser.js). Only rows whose stored
// report is MISSING a vitamin the fixed parser now finds are touched.
//
// Keeps everything an admin or scraper set (photo, brand, pack size,
// nutrition panel, food-type override) and only replaces what analysis
// produces. Uses Gemini for the summary/insights, so it paces itself and
// stops early if Gemini keeps failing.
//
// Usage:
//   node scripts/refresh-vitamin-reports.js --limit=3          (dry run, first 3)
//   node scripts/refresh-vitamin-reports.js --limit=3 --write
//   node scripts/refresh-vitamin-reports.js --write            (all)

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { parseLabel } from '../src/services/ingredientParser.js';
import { analyzeText } from '../src/services/analyzeText.js';

const PACING_MS = 1500;
const MAX_CONSECUTIVE_FAILURES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().trim();
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function loadAffected() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('product_reports')
      .select('id, product_name, ingredients_text, report')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      if (!/vitamin/i.test(r.ingredients_text || '')) continue;
      const stored = new Set((r.report?.ingredients || []).map((i) => norm(i.name)));
      const missing = parseLabel(r.ingredients_text).ingredients
        .map((i) => i.displayName)
        .filter((n) => /^vitamin/i.test(n) && !stored.has(norm(n)));
      if (missing.length) out.push({ ...r, missing });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  const limit = Number(arg('limit')) || Infinity;

  const affected = (await loadAffected()).slice(0, limit);
  console.log(`${affected.length} report(s) to refresh. Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  let done = 0;
  let failed = 0;
  let consecutive = 0;

  for (const row of affected) {
    const old = row.report;
    const nutrientsInfo = old.realNutrients
      ? {
          nutrients: old.realNutrients,
          nutrientsPer100: old.nutrientsPer100,
          servingGrams: old.realNutrientsServingGrams ?? null,
          servingUnit: old.realNutrientsServingUnit || 'g',
        }
      : undefined;
    try {
      const { report: fresh } = await analyzeText(
        row.ingredients_text,
        old.productName || row.product_name,
        old.brand || undefined,
        null,
        old.imageUrl || undefined,
        nutrientsInfo,
        old.packSize || undefined,
      );
      const next = { ...old, ...fresh };
      // Never let a refresh undo what an admin/scraper put on the report.
      next.imageUrl = old.imageUrl ?? fresh.imageUrl;
      if (old.nutritionPanel) next.nutritionPanel = old.nutritionPanel;
      if (old.foodTypeSource === 'admin') {
        next.foodType = old.foodType;
        next.isDeepFried = old.isDeepFried;
        next.foodTypeSource = 'admin';
      }

      console.log(`${row.product_name}: +${row.missing.join(', ')} | ingredients ${old.ingredients?.length} -> ${next.ingredients?.length} | score ${old.overallScore} -> ${next.overallScore}`);
      if (write) {
        const { error } = await supabase
          .from('product_reports')
          .update({ report: next, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw new Error(error.message);
      }
      done++;
      consecutive = 0;
    } catch (err) {
      failed++;
      consecutive++;
      console.warn(`FAILED ${row.product_name}: ${err.message}`);
      if (consecutive >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`\n${MAX_CONSECUTIVE_FAILURES} failures in a row -- stopping (Gemini quota?). Re-run to continue; refreshed rows are skipped.`);
        break;
      }
    }
    await sleep(PACING_MS);
  }
  console.log(`\nDone. ${done} refreshed, ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
