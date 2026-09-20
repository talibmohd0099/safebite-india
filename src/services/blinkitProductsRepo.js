// src/services/blinkitProductsRepo.js
//
// The Blinkit/JioMart scrape staging table (see
// supabase/blinkit_products_schema.sql, as later trimmed by
// blinkit_products_migration.sql). generate-reports.js reads the backlog
// here the same way it reads productsRepo.js's Open Food Facts backlog,
// turning each row into a real product_reports row so scraped products
// actually become searchable in the app.
//
// Neither Blinkit nor JioMart exposes a barcode, and this table's own
// upsert/uniqueness key is (brand, product_name) -- blinkit_id used to
// be that key but was deliberately dropped (see the migration above), so
// the lookup key here is derived from the same (source, brand,
// product_name) rather than any id column.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

function normalize(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

// Blinkit's nutrition attributes are clean "<number> <unit>" strings
// (e.g. "16 mg", "4.4 g") -- confirmed against real scraped rows.
function parseAmount(raw) {
  if (!raw) return null;
  const match = String(raw).match(/([\d.]+)\s*(mg|g)/i);
  if (!match) return null;
  return { value: toNumber(match[1]), unit: match[2].toLowerCase() };
}

// "Energy" is the one nutrition field that isn't a plain mg/g amount --
// Blinkit's own label format is "<n> kcal" (unlike the mg/g fields
// above). Not independently confirmed against a live scraped row the
// way the others are (parseAmount's comment), since seeding is
// currently paused -- if this ever silently returns null on real data,
// check the actual scraped string format first.
function parseKcal(raw) {
  const match = raw && String(raw).match(/([\d.]+)\s*kcal/i);
  return match ? toNumber(match[1]) : null;
}

// pack_size is Blinkit's own printed size string -- "500 ml", "1 kg",
// "2 x 250 ml" (a multipack: the PER-UNIT amount is what one serving is,
// not the combined total -- someone drinking a juice box drinks 250ml,
// not the whole pack of 2) -- confirmed against 20 real scraped rows
// spanning solids and liquids before writing this. kg/l are normalized
// to g/ml (the two units the rest of the app -- Result.jsx,
// dailyHabitCheck.js -- actually knows how to display) rather than kept
// as their own separate unit.
export function parsePackSize(text) {
  if (!text) return null;
  const multi = String(text).match(/^\d+\s*[x×]\s*([\d.]+)\s*(ml|l|g|kg)\b/i);
  const match = multi || String(text).match(/([\d.]+)\s*(ml|l|g|kg)\b/i);
  if (!match) return null;

  let value = toNumber(match[1]);
  let unit = match[2].toLowerCase();
  if (value === null) return null;
  if (unit === 'kg') { value *= 1000; unit = 'g'; }
  if (unit === 'l') { value *= 1000; unit = 'ml'; }
  if (value <= 0) return null;
  return { value: Math.round(value), unit };
}

// Real, already-scraped nutrition-panel numbers -- never estimated.
// Originally built only for the "if this became a daily habit" feature
// (dailyHabitCheck.js); also now the primary signal for Personal
// FoodGuard's nutrition-priority matching (personalAssessment.js)
// whenever it's available.
//
// @param {string|null} packSize - the row's own pack_size column, when
//   known (see parsePackSize above). Falls back to "per 100g" -- the
//   one figure FSSAI mandates every Indian label state -- when it isn't,
//   same honest fallback openFoodFacts.js uses for the same reason.
export function extractNutrientsForHabitCheck(nutrition, packSize = null) {
  if (!nutrition || Object.keys(nutrition).length === 0) return null;

  const toMg = (parsed) => (!parsed ? null : parsed.unit === 'g' ? parsed.value * 1000 : parsed.value);
  const toG = (parsed) => (!parsed ? null : parsed.unit === 'mg' ? parsed.value / 1000 : parsed.value);

  const sodiumMg = toMg(parseAmount(nutrition['Sodium']));
  const addedSugarG = toG(parseAmount(nutrition['Added Sugar']) || parseAmount(nutrition['Total Sugar']));
  const saturatedFatG = toG(parseAmount(nutrition['Saturated Fat']));
  const transFatG = toG(parseAmount(nutrition['Trans Fat']));
  const caloriesKcal = parseKcal(nutrition['Energy']);
  const proteinG = toG(parseAmount(nutrition['Protein']));
  // The rest of the rows an FSSAI-mandated Indian panel prints -- shown
  // in the Nutrition section, not used by scoring. Same key names as
  // openFoodFacts.js produces, so the UI never has to care which source
  // a product's numbers came from.
  const carbohydrateG = toG(parseAmount(nutrition['Carbohydrate'] || nutrition['Carbohydrates'] || nutrition['Total Carbohydrate']));
  const totalSugarG = toG(parseAmount(nutrition['Total Sugar'] || nutrition['Total Sugars'] || nutrition['Sugar']));
  const totalFatG = toG(parseAmount(nutrition['Total Fat'] || nutrition['Fat']));
  const fibreG = toG(parseAmount(nutrition['Dietary Fibre'] || nutrition['Dietary Fiber'] || nutrition['Fibre']));
  const cholesterolMg = toMg(parseAmount(nutrition['Cholesterol']));

  const nutrients = {};
  if (typeof sodiumMg === 'number') nutrients.sodiumMg = sodiumMg;
  if (typeof addedSugarG === 'number') nutrients.addedSugarG = addedSugarG;
  if (typeof saturatedFatG === 'number') nutrients.saturatedFatG = saturatedFatG;
  if (typeof transFatG === 'number') nutrients.transFatG = transFatG;
  if (typeof caloriesKcal === 'number') nutrients.caloriesKcal = caloriesKcal;
  if (typeof proteinG === 'number') nutrients.proteinG = proteinG;
  if (typeof carbohydrateG === 'number') nutrients.carbohydrateG = carbohydrateG;
  if (typeof totalFatG === 'number') nutrients.totalFatG = totalFatG;
  if (typeof fibreG === 'number') nutrients.fibreG = fibreG;
  if (typeof cholesterolMg === 'number') nutrients.cholesterolMg = cholesterolMg;
  // Same reason as openFoodFacts.js: addedSugarG already falls back to
  // the total when no added-sugar row exists, so keeping both would
  // print one measurement twice under two different names.
  if (typeof totalSugarG === 'number' && totalSugarG !== addedSugarG) {
    nutrients.totalSugarG = totalSugarG;
  }

  if (Object.keys(nutrients).length === 0) return null;
  const parsedPack = parsePackSize(packSize);
  return {
    nutrients,
    servingGrams: parsedPack?.value ?? null,
    servingUnit: parsedPack?.unit || 'g',
  };
}

export function blinkitLookupKey(source, brand, productName) {
  return `${source}:${normalize(`${brand} ${productName}`)}`;
}

/** Oldest-first backlog of scraped rows that don't have a report yet. */
export async function getPendingBlinkitProducts(limit) {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('blinkit_products')
    .select('id, source, product_name, brand, ingredients_text, image_url, nutrition, pack_size')
    .is('report_generated_at', null)
    .order('scraped_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[blinkit_products] Could not read pending backlog:', error.message);
    return [];
  }
  return data || [];
}

/** Marks a scraped row as handled -- either a report was saved, or it's a permanent failure not worth retrying. */
export async function markBlinkitReportGenerated(id) {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('blinkit_products')
    .update({ report_generated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.warn('[blinkit_products] Could not mark report generated:', error.message);
}
