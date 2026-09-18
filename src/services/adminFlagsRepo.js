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

/** The product_reports row a flag points at, if it was ever cached (a flag on an un-cached scan has no target). */
export async function adminFindProductByLookupKey(lookupKey) {
  requireSupabase();
  if (!lookupKey) return null;
  const { data, error } = await supabase.from('product_reports').select('id').eq('lookup_key', lookupKey).maybeSingle();
  if (error) return null;
  return data;
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
