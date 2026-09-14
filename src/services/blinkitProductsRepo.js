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

// Real, already-scraped nutrition-panel numbers for the "if this became
// a daily habit" feature (dailyHabitCheck.js) -- never estimated. No
// pack-size attribute is captured by the scraper today, so this is
// always framed as "per 100g" -- the one figure FSSAI mandates every
// Indian label state, so it's always a safe, honest assumption here
// even without knowing the pack's actual net weight.
export function extractNutrientsForHabitCheck(nutrition) {
  if (!nutrition || Object.keys(nutrition).length === 0) return null;

  const toMg = (parsed) => (!parsed ? null : parsed.unit === 'g' ? parsed.value * 1000 : parsed.value);
  const toG = (parsed) => (!parsed ? null : parsed.unit === 'mg' ? parsed.value / 1000 : parsed.value);

  const sodiumMg = toMg(parseAmount(nutrition['Sodium']));
  const addedSugarG = toG(parseAmount(nutrition['Added Sugar']) || parseAmount(nutrition['Total Sugar']));
  const saturatedFatG = toG(parseAmount(nutrition['Saturated Fat']));
  const transFatG = toG(parseAmount(nutrition['Trans Fat']));

  const nutrients = {};
  if (typeof sodiumMg === 'number') nutrients.sodiumMg = sodiumMg;
  if (typeof addedSugarG === 'number') nutrients.addedSugarG = addedSugarG;
  if (typeof saturatedFatG === 'number') nutrients.saturatedFatG = saturatedFatG;
  if (typeof transFatG === 'number') nutrients.transFatG = transFatG;

  if (Object.keys(nutrients).length === 0) return null;
  // No pack-size attribute is captured by the scraper today, so
  // servingGrams stays null -- the caller reads that as "these are the
  // standard per-100g figures," which is always true here.
  return { nutrients, servingGrams: null };
}

export function blinkitLookupKey(source, brand, productName) {
  return `${source}:${normalize(`${brand} ${productName}`)}`;
}

/** Oldest-first backlog of scraped rows that don't have a report yet. */
export async function getPendingBlinkitProducts(limit) {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('blinkit_products')
    .select('id, source, product_name, brand, ingredients_text, image_url, nutrition')
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
