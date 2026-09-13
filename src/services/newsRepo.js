// src/services/newsRepo.js
// Reads the news_items table that scripts/fetch-news.js populates on a
// schedule. The app never calls PubMed or a news API directly -- only
// this cached table -- so a slow or rate-limited upstream source never
// affects page load.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

export async function getNewsItems(type, limit = 20) {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('news_items')
    .select('id, title, link, source, published_at')
    .eq('type', type)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}
