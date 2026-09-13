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

export function blinkitLookupKey(source, brand, productName) {
  return `${source}:${normalize(`${brand} ${productName}`)}`;
}

/** Oldest-first backlog of scraped rows that don't have a report yet. */
export async function getPendingBlinkitProducts(limit) {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('blinkit_products')
    .select('id, source, product_name, brand, ingredients_text, image_url')
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
