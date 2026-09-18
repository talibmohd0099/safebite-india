// src/services/adminProductsRepo.js
//
// Admin-panel-only reads/writes against product_reports -- separate
// from productCache.js's saveReport() because editing needs to update
// the SAME row by its id even when the edit changes the lookup_key
// (e.g. correcting the ingredients text also changes textKey()'s hash
// of it). saveReport()'s upsert-on-lookup_key would instead leave the
// old row behind as an orphaned duplicate in that case.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { barcodeKey } from './productCache.js';
import { logActivity } from './adminActivityRepo.js';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured.');
}

/**
 * @param {object} opts
 * @param {string} [opts.search] - matched against product_name
 * @param {string} [opts.brand] - matched against report->brand (case-insensitive contains)
 * @param {string[]} [opts.categoryKeywords] - OR-matched against product_name (see categoryKeywords.js)
 * @param {string[]} [opts.lookupKeys] - restrict to exactly these lookup_keys (the flagged-only filter)
 */
export async function adminListProducts({
  search = '',
  brand = '',
  categoryKeywords = null,
  lookupKeys = null,
  limit = 30,
  offset = 0,
} = {}) {
  requireSupabase();
  let query = supabase
    .from('product_reports')
    .select('id, lookup_key, source, product_name, ingredients_text, report, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const cleanedSearch = search.trim();
  if (cleanedSearch) query = query.ilike('product_name', `%${cleanedSearch}%`);

  const cleanedBrand = brand.trim();
  if (cleanedBrand) query = query.ilike('report->>brand', `%${cleanedBrand}%`);

  if (categoryKeywords?.length) {
    query = query.or(categoryKeywords.map((k) => `product_name.ilike.%${k}%`).join(','));
  }

  if (lookupKeys) {
    if (lookupKeys.length === 0) return { rows: [], count: 0 }; // nothing is flagged -- an empty IN() would match everything instead
    query = query.in('lookup_key', lookupKeys);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [], count: count || 0 };
}

export async function adminGetProduct(id) {
  requireSupabase();
  const { data, error } = await supabase.from('product_reports').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Another product with this exact name, other than `excludeId` itself when editing. */
export async function adminFindByName(productName, excludeId = null) {
  requireSupabase();
  const cleaned = productName.trim();
  if (!cleaned) return null;
  let query = supabase.from('product_reports').select('id, product_name').ilike('product_name', cleaned).limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) return null; // a duplicate-name check failing silently is better than blocking a save over it
  return data;
}

/** Another product with this exact barcode, other than `excludeId` itself when editing. */
export async function adminFindByBarcode(barcode, excludeId = null) {
  requireSupabase();
  const cleaned = barcode.trim();
  if (!cleaned) return null;
  let query = supabase.from('product_reports').select('id, product_name').eq('lookup_key', barcodeKey(cleaned)).limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data;
}

/** Throws a plain, admin-readable message on a duplicate lookup_key. */
function rethrowFriendly(error) {
  if (error.code === '23505') {
    throw new Error('A product with this exact barcode or ingredients text already exists. Search for it and edit that one instead.');
  }
  throw new Error(error.message);
}

export async function adminCreateProduct({ lookupKey, source, productName, ingredientsText, report }) {
  requireSupabase();
  const { data, error } = await supabase
    .from('product_reports')
    .insert({ lookup_key: lookupKey, source, product_name: productName, ingredients_text: ingredientsText, report })
    .select('id')
    .single();
  if (error) rethrowFriendly(error);
  logActivity({ action: 'create', targetType: 'product', targetId: data.id, productName });
  return data.id;
}

export async function adminUpdateProduct(id, { lookupKey, source, productName, ingredientsText, report }) {
  requireSupabase();
  const { error } = await supabase
    .from('product_reports')
    .update({
      lookup_key: lookupKey,
      source,
      product_name: productName,
      ingredients_text: ingredientsText,
      report,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) rethrowFriendly(error);
  logActivity({ action: 'update', targetType: 'product', targetId: id, productName });
}

export async function adminDeleteProduct(id, productName = null) {
  requireSupabase();
  const { error } = await supabase.from('product_reports').delete().eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'delete', targetType: 'product', targetId: id, productName });
}

/**
 * Lightweight full-catalog fetch for duplicate detection -- id, name,
 * brand and just enough of the report to judge which candidate in a
 * group is worth keeping (has a photo / real nutrition data). PostgREST
 * caps a single request's rows, so this pages through everything
 * rather than trusting one big .select() to return it all.
 */
export async function adminListAllProductsLight() {
  requireSupabase();
  const PAGE = 1000;
  const all = [];
  // Pulls only the specific JSON paths needed (not the whole report --
  // that includes the full per-ingredient breakdown, which across
  // 3000+ rows is the difference between a few seconds and tens of
  // seconds for a scan nothing here actually needs that much data for.
  const SELECT = 'id, product_name, lookup_key, updated_at, brand:report->brand, score:report->overallScore, image_url:report->imageUrl, nutrition_panel:report->nutritionPanel, real_nutrients:report->realNutrients';
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('product_reports').select(SELECT).range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...data.map((row) => ({
      id: row.id,
      productName: row.product_name,
      lookupKey: row.lookup_key,
      updatedAt: row.updated_at,
      brand: row.brand || null,
      score: row.score ?? null,
      hasImage: Boolean(row.image_url),
      hasNutrition: Boolean(row.nutrition_panel || row.real_nutrients),
    })));
    if (data.length < PAGE) break;
  }
  return all;
}

/** Deletes every id in `removeIds`, keeping `keepId` -- one merge, logged as one entry. */
export async function adminMergeProducts(keepId, removeIds, productName) {
  requireSupabase();
  if (removeIds.length === 0) return;
  const { error } = await supabase.from('product_reports').delete().in('id', removeIds);
  if (error) throw new Error(error.message);
  logActivity({ action: 'merge', targetType: 'product', targetId: keepId, productName, details: { removedIds: removeIds } });
}
