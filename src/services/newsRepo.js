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

/**
 * News/research whose title mentions this product's brand or one of its
 * flagged (harmful/concerning) ingredients -- shown on the Result page
 * as "Related reading". Deliberately keyed off flagged ingredients only,
 * not the full list: an article title is far more likely to be about a
 * specific concerning substance ("lead in turmeric") than about an
 * everyday bulk ingredient ("wheat flour"), and matching on those too
 * would mostly just add noise. Same LIKE-escaping as searchCachedProducts,
 * since brand/ingredient names are real text, not our own fixed list.
 */
export async function getRelatedNews({ brand, flaggedIngredientNames = [], limit = 4 }) {
  if (!isSupabaseConfigured) return [];

  const escape = (k) => k.trim().replace(/[,()]/g, ' ').replace(/[\\%_]/g, '\\$&');
  const keywords = [brand, ...flaggedIngredientNames]
    .filter((k) => typeof k === 'string' && k.trim().length >= 4)
    .slice(0, 6) // caps the filter's size -- a product with many flagged ingredients shouldn't build an unbounded query
    .map(escape);

  if (keywords.length === 0) return [];

  const orFilter = keywords.map((k) => `title.ilike.%${k}%`).join(',');

  const { data, error } = await supabase
    .from('news_items')
    .select('id, type, title, link, source, published_at')
    .or(orFilter)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}
