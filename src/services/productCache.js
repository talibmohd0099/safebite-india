// src/services/productCache.js
// Shared cache so repeat scans of the same product reuse a saved AI
// report instead of paying for a fresh AI call every time.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

function normalizeText(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function barcodeKey(barcode) {
  return `barcode:${barcode.trim()}`;
}

export function textKey(ingredientsText) {
  return `text:${normalizeText(ingredientsText)}`;
}

/**
 * Find already-analyzed products by name, for the search suggestions.
 * These are free and instant to open (the report is already saved), so
 * they're worth showing above live database results.
 */
export async function searchCachedProducts(query, { limit = 5 } = {}) {
  if (!isSupabaseConfigured) return [];

  const cleaned = (query || '').trim();
  if (cleaned.length < 2) return [];

  // Escape LIKE wildcards so a typed "%" searches for a literal "%"
  // instead of silently matching everything.
  const pattern = `%${cleaned.replace(/[\\%_]/g, '\\$&')}%`;

  const { data, error } = await supabase
    .from('product_reports')
    .select('lookup_key, product_name, report')
    .ilike('product_name', pattern)
    .limit(limit);

  if (error || !data) return [];

  return data
    .filter((row) => row.product_name)
    .map((row) => ({
      lookupKey: row.lookup_key,
      productName: row.product_name,
      brand: row.report?.brand || null,
      score: typeof row.report?.overallScore === 'number' ? row.report.overallScore : null,
      verdict: row.report?.verdict || null,
    }));
}

/**
 * Browse already-scored products matching any of the given keywords
 * against their product name -- the home screen's "browse by category"
 * feature. Keywords are our own fixed list (src/data/categories.js),
 * never user input, so building the OR filter directly is safe here
 * (unlike searchCachedProducts, which has to escape a typed query).
 */
export async function browseCategoryProducts(keywords, { limit = 24 } = {}) {
  if (!isSupabaseConfigured || !keywords?.length) return [];

  const orFilter = keywords.map((k) => `product_name.ilike.%${k}%`).join(',');

  const { data, error } = await supabase
    .from('product_reports')
    .select('lookup_key, product_name, report')
    .or(orFilter)
    .limit(limit);

  if (error || !data) return [];

  return data
    .filter((row) => row.product_name)
    .map((row) => ({
      lookupKey: row.lookup_key,
      productName: row.product_name,
      brand: row.report?.brand || null,
      imageUrl: row.report?.imageUrl || null,
      score: typeof row.report?.overallScore === 'number' ? row.report.overallScore : null,
      verdict: row.report?.verdict || null,
    }));
}

/**
 * Look up a cached report by its key. Returns null on a cache miss,
 * on error, or if Supabase isn't configured yet — callers should treat
 * null the same as "no cache, go ahead and call the AI".
 */
export async function getCachedReport(lookupKey) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('product_reports')
    .select('id, scan_count, report, ingredients_text')
    .eq('lookup_key', lookupKey)
    .maybeSingle();

  if (error || !data) return null;

  // Bump the hit counter in the background — doesn't need to block the user.
  supabase
    .from('product_reports')
    .update({ scan_count: data.scan_count + 1, updated_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}, () => {});

  // The raw label text lives in its own column, not inside the report
  // JSON -- attach it here so callers get it the same way whether this
  // was a fresh analysis or a cache hit.
  return { ...data.report, ingredientsText: data.ingredients_text };
}

/**
 * Rename the product on an already-cached report — e.g. fixing
 * "Unknown Product" once a human actually knows what it is. Updates
 * both the product_name column and the name inside the saved report
 * JSON, so every future cache hit shows the corrected name too.
 * Safe to call even if Supabase isn't configured — it just no-ops.
 */
export async function updateProductName(lookupKey, productName) {
  if (!isSupabaseConfigured || !lookupKey || !productName) return;

  try {
    const { data } = await supabase
      .from('product_reports')
      .select('report')
      .eq('lookup_key', lookupKey)
      .maybeSingle();

    if (!data) return;

    await supabase
      .from('product_reports')
      .update({
        product_name: productName,
        report: { ...data.report, productName },
        updated_at: new Date().toISOString(),
      })
      .eq('lookup_key', lookupKey);
  } catch {
    // Best-effort — the user's local copy is already renamed either way.
  }
}

/**
 * Save a freshly-generated AI report to the shared cache so the next
 * person (or the same person, next time) skips the AI call entirely.
 * Safe to call even if Supabase isn't configured — it just no-ops.
 */
export async function saveReport({ lookupKey, source, productName, ingredientsText, report }) {
  if (!isSupabaseConfigured) return;

  try {
    await supabase.from('product_reports').upsert(
      {
        lookup_key: lookupKey,
        source,
        product_name: productName || null,
        ingredients_text: ingredientsText,
        report,
      },
      { onConflict: 'lookup_key' }
    );
  } catch {
    // Caching is a bonus, not a requirement — never block the user's report on this.
  }
}
