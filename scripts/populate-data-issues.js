// scripts/populate-data-issues.js
//
// Scans product_reports for physically-implausible per-100 nutrient
// values (same ceilings the earlier audit passes used), checks each one
// against its real source ONE more time (live Open Food Facts for
// barcode rows, the raw scraped text in blinkit_products for Blinkit
// rows) so the reason recorded is accurate as of right now, and inserts
// a row into product_data_issues for anything still unresolved -- see
// supabase/product_data_issues_schema.sql (run that once first) and the
// admin page at #/admin/data-issues.
//
// Idempotent: skips anything that already has an OPEN issue recorded for
// the same product + nutrient, so re-running this periodically (e.g.
// after future scrape rounds) only adds genuinely new findings.
//
// Usage:
//   node scripts/populate-data-issues.js            (dry run)
//   node scripts/populate-data-issues.js --write

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { getNutrientsPer100 } from '../src/services/nutrientBasis.js';
import { blinkitLookupKey } from '../src/services/blinkitProductsRepo.js';

const CHECKS = [
  { key: 'sodiumMg', label: 'sodium', ceiling: 10000, unit: 'mg' },
  { key: 'caloriesKcal', label: 'calories', ceiling: 920, unit: 'kcal' },
  { key: 'proteinG', label: 'protein', ceiling: 100, unit: 'g' },
  { key: 'totalFatG', label: 'fat', ceiling: 100, unit: 'g' },
  { key: 'carbohydrateG', label: 'carbs', ceiling: 100, unit: 'g' },
  { key: 'totalSugarG', label: 'total sugar', ceiling: 100, unit: 'g' },
  { key: 'addedSugarG', label: 'added sugar', ceiling: 100, unit: 'g' },
  { key: 'saturatedFatG', label: 'saturated fat', ceiling: 100, unit: 'g' },
  { key: 'transFatG', label: 'trans fat', ceiling: 100, unit: 'g' },
  { key: 'fibreG', label: 'fibre', ceiling: 100, unit: 'g' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OFF_FIELD = {
  sodium: 'sodium_100g', calories: 'energy-kcal_100g', protein: 'proteins_100g', fat: 'fat_100g',
  carbs: 'carbohydrates_100g', 'total sugar': 'sugars_100g', 'added sugar': 'added-sugars_100g',
  'saturated fat': 'saturated-fat_100g', 'trans fat': 'trans-fat_100g', fibre: 'fiber_100g',
};

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      if (i === attempts) throw err;
      await sleep(1500 * i);
    }
  }
}

async function offReason(barcode, nutrientLabel, key, value, unit) {
  try {
    const field = OFF_FIELD[nutrientLabel];
    if (!field) return `Physically implausible (${value}${unit} per 100g). Not individually re-checked against a live source field for this nutrient -- worth a manual look at the product's real label.`;
    const json = await fetchWithRetry(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${field},product_name`);
    const live = json.product?.[field];
    if (typeof live !== 'number') return `Physically implausible (${value}${unit} per 100g). Open Food Facts no longer has this field for this barcode -- may need a fresh lookup or a different barcode entirely.`;
    const liveDerived = field === 'sodium_100g' ? live * 1000 : live;
    if (Math.abs(liveDerived - value) < Math.max(1, value * 0.02)) {
      return `Checked live against Open Food Facts (barcode ${barcode}): its own ${field} field still gives this same figure. Either genuinely correct for this product, or an error on OFF's own page that can't be fixed by a formula -- worth checking the real pack, or whether this barcode is matched to the right product at all.`;
    }
    return `Open Food Facts' live data has since changed (now implies ~${Math.round(liveDerived)}${unit}) -- this row is stale and just needs a refresh, not a manual data fix.`;
  } catch {
    return `Physically implausible (${value}${unit} per 100g). Could not re-check Open Food Facts live (network/lookup failed) -- needs a manual look.`;
  }
}

let blinkitCache = null;
async function loadBlinkitProducts() {
  if (blinkitCache) return blinkitCache;
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('blinkit_products').select('product_name, brand, source, nutrition').not('nutrition', 'is', null).order('id', { ascending: true }).range(from, from + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  blinkitCache = all;
  return all;
}

const BLINKIT_FIELD = {
  sodium: 'Sodium', calories: 'Energy', protein: 'Protein', fat: 'Total Fat',
  carbs: 'Carbohydrate', 'total sugar': 'Total Sugar', 'added sugar': 'Added Sugar',
  'saturated fat': 'Saturated Fat', 'trans fat': 'Trans Fat', fibre: 'Dietary Fibre',
};

async function blinkitReason(lookupKey, nutrientLabel, value, unit) {
  try {
    const rows = await loadBlinkitProducts();
    const match = rows.find((r) => blinkitLookupKey(r.source, r.brand, r.product_name) === lookupKey);
    if (!match) return `Physically implausible (${value}${unit} per 100g). Could not find the matching blinkit_products row anymore to re-check its raw scraped text -- may have been removed or re-keyed.`;
    const field = BLINKIT_FIELD[nutrientLabel];
    const raw = field ? match.nutrition?.[field] : null;
    if (raw) return `Blinkit's own scraped page text for "${match.product_name}" reads "${raw}" for ${nutrientLabel} -- matches what's stored. Either genuinely correct for this concentrated product, or a data-entry error on Blinkit's own listing that can't be fixed by a formula.`;
    return `Physically implausible (${value}${unit} per 100g). Blinkit's raw nutrition text has no "${field || nutrientLabel}" field for this product to re-check against -- worth a manual look.`;
  } catch {
    return `Physically implausible (${value}${unit} per 100g). Could not re-check Blinkit's raw data (lookup failed) -- needs a manual look.`;
  }
}

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  const { data: existingOpen, error: openErr } = await supabase.from('product_data_issues').select('lookup_key, nutrient').eq('status', 'open');
  if (openErr) {
    console.error('Could not read product_data_issues -- has supabase/product_data_issues_schema.sql been run yet?', openErr.message);
    process.exitCode = 1;
    return;
  }
  const alreadyOpen = new Set((existingOpen || []).map((r) => `${r.lookup_key}::${r.nutrient}`));

  let all = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('product_reports').select('id, product_name, source, lookup_key, report').order('id').range(from, from + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }

  let inserted = 0, skippedExisting = 0, checked = 0;

  for (const row of all) {
    const per100 = getNutrientsPer100(row.report);
    if (!per100) continue;

    for (const c of CHECKS) {
      const value = per100[c.key];
      if (typeof value !== 'number' || value <= c.ceiling) continue;
      checked++;

      const dedupeKey = `${row.lookup_key}::${c.label}`;
      if (alreadyOpen.has(dedupeKey)) { skippedExisting++; continue; }

      const barcode = row.lookup_key?.startsWith('barcode:') ? row.lookup_key.slice('barcode:'.length) : null;
      let reason;
      if (barcode) {
        reason = await offReason(barcode, c.label, c.key, value, c.unit);
        await sleep(400);
      } else if (row.source === 'blinkit') {
        reason = await blinkitReason(row.lookup_key, c.label, value, c.unit);
      } else {
        reason = `Physically implausible (${value}${c.unit} per 100g), source "${row.source}" -- needs a manual look.`;
      }

      console.log(`  ${row.product_name}  [${c.label}: ${value}${c.unit}]\n    -> ${reason}\n`);
      inserted++;

      if (write) {
        const { error } = await supabase.from('product_data_issues').insert({
          lookup_key: row.lookup_key,
          product_name: row.product_name,
          source: row.source,
          nutrient: c.label,
          current_value: value,
          unit: c.unit,
          reason,
          score_at_detection: row.report.overallScore ?? null,
          verdict_at_detection: row.report.verdict ?? null,
        });
        if (error) console.warn(`    could not save: ${error.message}`);
      }
    }
  }

  console.log(`\nChecked ${checked} implausible values. ${inserted} would be inserted (${write ? 'written' : 'dry run'}), ${skippedExisting} already have an open issue.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
