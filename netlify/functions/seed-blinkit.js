// netlify/functions/seed-blinkit.js
//
// Scheduled twin of seed-products.js, but sourcing from Blinkit instead
// of Open Food Facts. Every minute it picks one food category, takes the
// next few products from that category's sitemap, and saves their
// manufacturer-supplied ingredients (plus nutrition and FSSAI licence)
// into blinkit_products.
//
// Why Blinkit: Open Food Facts ingredient text is transcribed from
// photos of packs, which is the root cause of nearly every parsing bug
// in this project. Blinkit's text comes from the manufacturer, clean.
//
// A note on frequency: Netlify cron cannot go below one minute, so
// "every 30 seconds" isn't available. PRODUCTS_PER_RUN is the throughput
// dial instead — at 3 per minute that's a product every 20 seconds.
//
// Netlify reads the cron expression below statically at deploy time, so
// it has to stay a literal string.

import { schedule } from '@netlify/functions';
import { supabase, isSupabaseConfigured } from '../../src/services/supabaseClient.js';
import {
  FOOD_GROUPS,
  getProductSitemaps,
  productUrlsFrom,
  scrapeProduct,
  sleep,
} from '../../src/services/blinkit.js';

// Flip to true to stop the job without removing its schedule. While
// paused it still fires but does nothing — no requests, no writes.
const BLINKIT_PAUSED = true;

const PRODUCTS_PER_RUN = 3;
const TIME_BUDGET_MS = 8000;  // stay well inside Netlify's execution limit
const REQUEST_GAP_MS = 900;   // be polite; this is someone else's server

// Gemini fallback for products with no structured Ingredients attribute.
// Off by default: measured against a full category it recovered nothing
// (those products genuinely publish no ingredients anywhere on the page),
// so paying for a call per skipped product every minute buys nothing.
const USE_AI_FALLBACK = false;

// The clock decides whose turn it is, so no "current category" pointer
// has to be stored, and a skipped run just costs that category its turn
// rather than stalling the whole rotation.
function pickCategory(categories) {
  const slot = Math.floor(Date.now() / 60000);
  return categories[slot % categories.length];
}

async function getProgress(category, sitemapUrl) {
  const { data, error } = await supabase
    .from('blinkit_seed_progress')
    .select('*')
    .eq('category', category)
    .maybeSingle();

  if (error) {
    console.warn('[blinkit] Could not read progress (has blinkit_seed_progress_schema.sql been run?):', error.message);
  }
  return data || { category, sitemap_url: sitemapUrl, next_index: 0, exhausted: false, products_saved: 0 };
}

async function saveProgress(progress) {
  const { error } = await supabase
    .from('blinkit_seed_progress')
    .upsert({ ...progress, updated_at: new Date().toISOString() }, { onConflict: 'category' });
  if (error) {
    console.warn('[blinkit] Could not save progress:', error.message);
  }
}

export const handler = schedule('* * * * *', async () => {
  if (BLINKIT_PAUSED) {
    console.log('[blinkit] Paused — set BLINKIT_PAUSED to false in netlify/functions/seed-blinkit.js to resume.');
    return { statusCode: 200 };
  }
  if (!isSupabaseConfigured) {
    console.error('[blinkit] Supabase not configured — set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in Netlify env vars.');
    return { statusCode: 200 };
  }

  const startedAt = Date.now();

  const sitemaps = await getProductSitemaps();
  if (!sitemaps) {
    console.warn('[blinkit] Could not fetch the sitemap index this run — will retry next minute.');
    return { statusCode: 200 };
  }

  const foodSitemaps = sitemaps.filter((s) => FOOD_GROUPS.includes(s.group));
  if (foodSitemaps.length === 0) {
    console.warn('[blinkit] No food categories found in the sitemap — the site structure may have changed.');
    return { statusCode: 200 };
  }

  const target = pickCategory(foodSitemaps);
  const progress = await getProgress(target.category, target.url);

  if (progress.exhausted) {
    console.log(`[blinkit] ${target.category}: already fully scraped (${progress.products_saved} saved). Nothing to do.`);
    return { statusCode: 200 };
  }

  const urls = await productUrlsFrom(progress.sitemap_url || target.url);
  // null means the fetch failed — a transient network problem must not
  // be mistaken for "this category is finished", which is exactly the
  // bug that silently killed off companies in the Open Food Facts job.
  if (urls === null) {
    console.warn(`[blinkit] ${target.category}: sitemap fetch failed — retrying from index ${progress.next_index} next run.`);
    return { statusCode: 200 };
  }

  if (progress.next_index >= urls.length) {
    await saveProgress({ ...progress, exhausted: true });
    console.log(`[blinkit] ${target.category}: reached the end of the sitemap (${urls.length} products). Marking done.`);
    return { statusCode: 200 };
  }

  const batch = urls.slice(progress.next_index, progress.next_index + PRODUCTS_PER_RUN);
  const scraped = [];
  let processed = 0;
  let skipped = 0;

  for (const url of batch) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const result = await scrapeProduct(url, target.category, { useAI: USE_AI_FALLBACK });
    processed++;

    if (result.error) {
      skipped++;
    } else {
      scraped.push(result.product);
    }

    await sleep(REQUEST_GAP_MS);
  }

  let saved = 0;
  if (scraped.length > 0) {
    // The same product can appear more than once in a sitemap; collapse
    // duplicates so a single upsert batch doesn't conflict with itself.
    const deduped = [...new Map(scraped.map((p) => [`${p.brand}|${p.product_name}`, p])).values()];

    const { error } = await supabase
      .from('blinkit_products')
      .upsert(deduped, { onConflict: 'brand,product_name' });

    if (error) {
      // Don't advance past products that were never stored — leaving the
      // cursor put means the next run retries them.
      console.error(`[blinkit] Save failed, not advancing cursor: ${error.message}`);
      return { statusCode: 200 };
    }
    saved = deduped.length;
  }

  await saveProgress({
    category: target.category,
    sitemap_url: target.url,
    next_index: progress.next_index + processed,
    exhausted: false,
    products_saved: progress.products_saved + saved,
  });

  console.log(
    `[blinkit] ${target.category} [${progress.next_index}-${progress.next_index + processed} of ${urls.length}]: saved ${saved}, skipped ${skipped} without ingredients.`
  );

  return { statusCode: 200 };
});
