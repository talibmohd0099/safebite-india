// src/services/adminFlagsRepo.js
//
// Admin-side read/triage of product_flags (see productFlags.js and
// supabase/product_flags_schema.sql) -- real users have been able to
// report a problem with a result for a while, but until now nothing
// ever looked at what they'd sent in.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { logActivity } from './adminActivityRepo.js';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured.');
}

export async function adminListFlags({ status = 'open', limit = 50, offset = 0 } = {}) {
  requireSupabase();
  let query = supabase
    .from('product_flags')
    .select('id, lookup_key, product_name, reason, remarks, score_at_flag, verdict_at_flag, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [], count: count || 0 };
}

/** Distinct lookup_keys with at least one open flag -- feeds the product list's "Flagged only" filter. */
export async function adminOpenFlaggedLookupKeys() {
  requireSupabase();
  const { data, error } = await supabase.from('product_flags').select('lookup_key').eq('status', 'open').not('lookup_key', 'is', null);
  if (error) throw new Error(error.message);
  return [...new Set((data || []).map((r) => r.lookup_key))];
}

/**
 * The product_reports row a flag points at. Tries the lookup_key first,
 * then falls back to an exact product_name match -- a real case this
 * caught: a flag's key stopped matching not because the product was
 * deleted, but because its barcode had been corrected via a normal
 * admin edit afterward (blinkit:... -> barcode:...), which changes
 * lookup_key without touching the row itself or its name. Only a
 * product genuinely missing by BOTH has nothing left to edit.
 */
export async function adminFindProductByLookupKey(lookupKey, productName = null) {
  requireSupabase();
  if (lookupKey) {
    const { data, error } = await supabase.from('product_reports').select('id').eq('lookup_key', lookupKey).maybeSingle();
    if (!error && data) return data;
  }
  if (productName) {
    const { data, error } = await supabase.from('product_reports').select('id').eq('product_name', productName).maybeSingle();
    if (!error && data) return data;
  }
  return null;
}

/**
 * Which of the given flags are truly orphaned -- no product_reports row
 * matches EITHER their lookup_key or their product_name any more. Real
 * case that made this necessary: a flag on "Nandini Sampoorna Toned
 * Milk" read as gone because its OWN barcode had been corrected that
 * same day (a completely normal admin edit, not a deletion) -- a
 * key-only check would have kept mislabelling it "removed from
 * catalog", which it never was. Two batched queries for the whole
 * list (key pass, then a name pass only for what's still unresolved),
 * not one per row. Returns a Set of flag ids.
 */
export async function adminOrphanedFlags(flags) {
  requireSupabase();
  const withKeys = flags.filter((f) => f.lookup_key);
  if (withKeys.length === 0) return new Set();

  const keys = [...new Set(withKeys.map((f) => f.lookup_key))];
  const { data: byKey, error: keyErr } = await supabase.from('product_reports').select('lookup_key').in('lookup_key', keys);
  if (keyErr) return new Set(); // uncertain -- don't claim orphaned, "Edit product" still gives the accurate answer on click

  const keyFound = new Set((byKey || []).map((r) => r.lookup_key));
  const stillMissing = withKeys.filter((f) => !keyFound.has(f.lookup_key));
  if (stillMissing.length === 0) return new Set();

  const names = [...new Set(stillMissing.map((f) => f.product_name).filter(Boolean))];
  if (names.length === 0) return new Set(stillMissing.map((f) => f.id));

  const { data: byName, error: nameErr } = await supabase.from('product_reports').select('product_name').in('product_name', names);
  if (nameErr) return new Set(); // same -- fail open toward NOT claiming orphaned when unsure

  const nameFound = new Set((byName || []).map((r) => r.product_name));
  return new Set(stillMissing.filter((f) => !nameFound.has(f.product_name)).map((f) => f.id));
}

export async function adminResolveFlag(id, productName = null) {
  requireSupabase();
  const { error } = await supabase.from('product_flags').update({ status: 'resolved' }).eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'resolve_flag', targetType: 'flag', targetId: id, productName });
}

export async function adminReopenFlag(id, productName = null) {
  requireSupabase();
  const { error } = await supabase.from('product_flags').update({ status: 'open' }).eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'reopen_flag', targetType: 'flag', targetId: id, productName });
}
