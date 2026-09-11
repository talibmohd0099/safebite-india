// src/services/productsRepo.js
//
// The raw product catalog (see supabase/products_schema.sql) -- separate
// from src/services/productCache.js, which handles the computed report.
// scripts/discover-off-products.js writes here; scripts/generate-reports.js
// reads the backlog and turns it into product_reports rows.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

/** Which of these lookup keys are already in the catalog, so a discovery run doesn't re-fetch them. */
export async function existingLookupKeys(keys) {
  if (!isSupabaseConfigured || keys.length === 0) return new Set();

  const { data } = await supabase.from('products').select('lookup_key').in('lookup_key', keys);
  return new Set((data || []).map((r) => r.lookup_key));
}

export async function saveProduct({ lookupKey, source, productName, brand, ingredientsText, offIngredients, imageUrl }) {
  if (!isSupabaseConfigured) return;

  await supabase.from('products').upsert(
    {
      lookup_key: lookupKey,
      source,
      product_name: productName || null,
      brand: brand || null,
      ingredients_text: ingredientsText,
      off_ingredients: offIngredients || null,
      image_url: imageUrl || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'lookup_key' }
  );
}

/** Oldest-first backlog of products that don't have a report yet. */
export async function getPendingProducts(limit) {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('products')
    .select('lookup_key, source, product_name, brand, ingredients_text, off_ingredients, image_url')
    .is('report_generated_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[products] Could not read pending backlog:', error.message);
    return [];
  }
  return data || [];
}

/** Marks a product as handled -- either a report was saved, or it's a permanent failure not worth retrying. */
export async function markReportGenerated(lookupKey) {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('products')
    .update({ report_generated_at: new Date().toISOString() })
    .eq('lookup_key', lookupKey);

  if (error) console.warn('[products] Could not mark report generated:', error.message);
}
