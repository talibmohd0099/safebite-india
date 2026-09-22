// src/services/adminDataIssuesRepo.js
//
// Admin-side read/triage of product_data_issues -- see
// supabase/product_data_issues_schema.sql for what these are (audit
// scripts finding a nutrient value they checked against its real source
// and still couldn't resolve automatically) and adminFlagsRepo.js for
// the equivalent for real user reports.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { logActivity } from './adminActivityRepo.js';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured.');
}

export async function adminListDataIssues({ status = 'open', limit = 100, offset = 0 } = {}) {
  requireSupabase();
  let query = supabase
    .from('product_data_issues')
    .select('id, lookup_key, product_name, source, nutrient, current_value, unit, reason, score_at_detection, verdict_at_detection, status, detected_at', { count: 'exact' })
    .order('detected_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [], count: count || 0 };
}

/** The product_reports row an issue points at, if it's still cached. */
export async function adminFindProductByLookupKey(lookupKey) {
  requireSupabase();
  if (!lookupKey) return null;
  const { data, error } = await supabase.from('product_reports').select('id').eq('lookup_key', lookupKey).maybeSingle();
  if (error) return null;
  return data;
}

export async function adminResolveDataIssue(id, productName = null) {
  requireSupabase();
  const { error } = await supabase.from('product_data_issues').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'resolve_data_issue', targetType: 'data_issue', targetId: id, productName });
}

export async function adminReopenDataIssue(id, productName = null) {
  requireSupabase();
  const { error } = await supabase.from('product_data_issues').update({ status: 'open', resolved_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'reopen_data_issue', targetType: 'data_issue', targetId: id, productName });
}
