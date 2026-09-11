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
  // instead of silently matching everything. Also strip "," and "()" --
  // this value now sits inside an unquoted .or() filter string below,
  // where those characters are structural syntax (condition separator /
  // grouping), not literal search characters. A product search has no
  // legitimate need for them anyway, so dropping them is simpler and
  // safer than trying to escape them correctly for that mini-language.
  const pattern = `%${cleaned.replace(/[,()]/g, ' ').replace(/[\\%_]/g, '\\$&')}%`;

  // Match on brand too, not just product name -- searching "Nestlé"
  // should find Maggi/KitKat even though neither name contains the
  // word "Nestlé". Brand lives inside the report JSON, not its own
  // column, hence the report->>brand path in the OR filter.
  const { data, error } = await supabase
    .from('product_reports')
    .select('lookup_key, product_name, report')
    .or(`product_name.ilike.${pattern},report->>brand.ilike.${pattern}`)
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
 * The most-scanned products, reduced to short search terms (brand name
 * when we have one, otherwise the full product name) for the home
 * screen's "Popular searches" pills. Real usage data, not a hardcoded
 * guess -- it'll naturally shift over time as more people scan things.
 */
// Brand text comes straight from Open Food Facts' crowdsourced data, so
// casing is inconsistent ("bingo", "ITC", "Parle"). Only fix the clearly
// broken cases (all one case) -- a genuine mixed-case brand name is
// more likely right than a generic title-case pass would be.
function normalizeCasing(label) {
  if (label === label.toUpperCase() || label === label.toLowerCase()) {
    return label.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }
  return label;
}

export async function getPopularSearchTerms(limit = 8) {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('product_reports')
    .select('product_name, report, scan_count')
    .order('scan_count', { ascending: false })
    .limit(limit * 6); // over-fetch so de-duping brands + skipping long names still leaves enough

  if (error || !data) return [];

  const seen = new Set();
  const terms = [];
  for (const row of data) {
    // A search pill should read like a brand, not a full product name --
    // skip anything too long for that rather than showing an oddly long tile.
    const label = row.report?.brand?.length <= 18 ? row.report.brand : null;
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(normalizeCasing(label));
    if (terms.length >= limit) break;
  }
  return terms;
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
