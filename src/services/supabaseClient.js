// src/services/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Works both in the browser (Vite injects import.meta.env at build time)
// and in Node -- the Netlify scheduled function reuses this same client,
// where env vars come from process.env instead.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// If these aren't set yet, the app should keep working without a shared
// cache (falls back to "always call the AI") rather than crashing.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
