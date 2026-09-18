// src/services/adminProductsRepo.js
//
// Admin-panel-only reads/writes against product_reports -- separate
// from productCache.js's saveReport() because editing needs to update
// the SAME row by its id even when the edit changes the lookup_key
// (e.g. correcting the ingredients text also changes textKey()'s hash
// of it). saveReport()'s upsert-on-lookup_key would instead leave the
// old row behind as an orphaned duplicate in that case.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured.');
}

export async function adminListProducts({ search = '', limit = 30, offset = 0 } = {}) {
  requireSupabase();
  let query = supabase
    .from('product_reports')
    .select('id, lookup_key, source, product_name, ingredients_text, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const cleaned = search.trim();
  if (cleaned) query = query.ilike('product_name', `%${cleaned}%`);

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
}

export async function adminDeleteProduct(id) {
  requireSupabase();
  const { error } = await supabase.from('product_reports').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
