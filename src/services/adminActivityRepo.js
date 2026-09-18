// src/services/adminActivityRepo.js
//
// Best-effort activity log -- see supabase/admin_activity_log_schema.sql.
// Never throws: a missing log row (table not created yet, or a
// transient write failure) must never block the real action it was
// recording, same philosophy as productCache.js's own cache writes.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

export async function logActivity({ action, targetType, targetId, productName, details }) {
  if (!isSupabaseConfigured) return;
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('admin_activity_log').insert({
      actor_email: data?.user?.email || null,
      action,
      target_type: targetType,
      target_id: targetId != null ? String(targetId) : null,
      product_name: productName || null,
      details: details || null,
    });
  } catch {
    // The log table may not exist yet (admin_activity_log_schema.sql
    // not run), or the write failed transiently -- either way, the
    // action it was recording already happened and must not be undone.
  }
}

export async function adminListActivity({ limit = 60 } = {}) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('admin_activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
