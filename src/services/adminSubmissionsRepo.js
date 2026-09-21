// src/services/adminSubmissionsRepo.js
//
// Admin-side read/triage of product_submissions (see productSubmissions.js
// and supabase/product_submissions_schema.sql) -- users have been able to
// submit a product FoodGuard couldn't find by barcode; this is where an
// admin actually looks at what they sent in and turns it into a real
// product. Same split as adminFlagsRepo.js/productFlags.js.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { logActivity } from './adminActivityRepo.js';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured.');
}

export async function adminListSubmissions({ status = 'pending', limit = 50, offset = 0 } = {}) {
  requireSupabase();
  let query = supabase
    .from('product_submissions')
    .select('id, barcode, product_name, product_photo, ingredients_photo, nutrition_photo, notes, status, admin_notes, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [], count: count || 0 };
}

/** Called once AdminProductForm has actually saved a product built from this submission -- not a separate manual step. */
export async function adminMarkSubmissionApproved(id, productName = null) {
  requireSupabase();
  const { error } = await supabase
    .from('product_submissions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'approve_submission', targetType: 'submission', targetId: id, productName });
}

export async function adminRejectSubmission(id, adminNotes = null) {
  requireSupabase();
  const { error } = await supabase
    .from('product_submissions')
    .update({ status: 'rejected', admin_notes: adminNotes || null, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'reject_submission', targetType: 'submission', targetId: id });
}

export async function adminReopenSubmission(id) {
  requireSupabase();
  const { error } = await supabase
    .from('product_submissions')
    .update({ status: 'pending', reviewed_at: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
  logActivity({ action: 'reopen_submission', targetType: 'submission', targetId: id });
}
