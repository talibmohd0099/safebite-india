// scripts/scrape-blinkit.js
//
// Walks Blinkit's food categories and saves brand / product name /
// ingredients (plus nutrition and FSSAI licence) into blinkit_products.
//
// Why this exists: Open Food Facts ingredient text is transcribed from
// photos of packs, which is the root cause of nearly every parsing bug
// in this project -- garbled brackets, missing commas, dropped
// ingredients. Blinkit's text is manufacturer-supplied, so it's clean.
//
// Discovery uses Blinkit's published sitemaps, not category pages:
// category listings vary by delivery location (an anonymous request for
// the cold-drinks category returns dairy), while the sitemaps are
// static and organised by category. robots.txt disallows /s/* (search),
// which this never touches.
//
// Most products expose ingredients as a structured attribute. For the
// ones that don't, Gemini is asked to find the ingredients inside the
// other text already on that page -- extraction only, never invention.
//
// Usage:
//   node scripts/scrape-blinkit.js --list
//   node scripts/scrape-blinkit.js --all --per-category 8
//   node scripts/scrape-blinkit.js --category soft-drinks --limit 15
//   node scripts/scrape-blinkit.js --all --per-category 5 --dry-run --no-ai

import { createClient } from '@supabase/supabase-js';

import {
  FOOD_GROUPS,
  getProductSitemaps,
  productUrlsFrom,
  scrapeProduct,
  sleep,
} from '../src/services/blinkit.js';

const REQUEST_GAP_MS = 1500; // be polite; this is someone else's server

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const CATEGORY = flag('category');
const SCRAPE_ALL = has('all');
const LIMIT = parseInt(flag('limit', '15'), 10);
const PER_CATEGORY = parseInt(flag('per-category', '8'), 10);
const DRY_RUN = has('dry-run');
const USE_AI = !has('no-ai');

function client() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Where each category got to last time, so repeated runs walk forward
 * through a category instead of re-fetching its first few products for
 * ever. Shares the blinkit_seed_progress table with the scheduled job.
 */
async function loadProgress(supabase) {
  const { data, error } = await supabase.from('blinkit_seed_progress').select('*');
  if (error) {
    console.warn('Could not read progress (has blinkit_seed_progress_schema.sql been run?):', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((row) => [row.category, row]));
}

async function saveProgress(supabase, rows) {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('blinkit_seed_progress')
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'category' });
  if (error) console.warn('Could not save progress:', error.message);
}

async function save(products) {
  const supabase = client();
  if (!supabase) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — nothing saved.');
    return false;
  }
  const { error } = await supabase
    .from('blinkit_products')
    .upsert(products, { onConflict: 'brand,product_name' });

  if (error) {
    console.error(`Save failed: ${error.message}`);
    console.error('(Have blinkit_products_schema.sql and blinkit_products_migration.sql both been run?)');
    return false;
  }
  return true;
}

async function main() {
  // Check credentials before scraping anything. Discovering this at the
  // save step instead means throwing away a full run's work — which is
  // exactly what happened to the first four scheduled runs.
  if (!DRY_RUN && !client()) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    console.error('Set them as repository secrets (Settings -> Secrets and variables -> Actions), or use --dry-run.');
    process.exitCode = 1;
    return;
  }

  const sitemaps = await getProductSitemaps();
  if (!sitemaps) {
    console.error('Could not fetch the Blinkit sitemap index. Check your connection and try again.');
    process.exitCode = 1;
    return;
  }

  if (has('list') || (!CATEGORY && !SCRAPE_ALL)) {
    const byGroup = {};
    for (const s of sitemaps) (byGroup[s.group] ||= new Set()).add(s.category);
    console.log(`${sitemaps.length} categories. Food groups marked with *:\n`);
    for (const [group, cats] of Object.entries(byGroup)) {
      console.log(`  ${FOOD_GROUPS.includes(group) ? '*' : ' '} ${group}`);
      console.log(`      ${[...cats].join(', ')}`);
    }
    console.log('\n  node scripts/scrape-blinkit.js --all --per-category 8');
    console.log('  node scripts/scrape-blinkit.js --category soft-drinks --limit 15');
    return;
  }

  let targets;
  if (SCRAPE_ALL) {
    targets = sitemaps.filter((s) => FOOD_GROUPS.includes(s.group));
    console.log(`Walking ${targets.length} food categories, up to ${PER_CATEGORY} products each.`);
  } else {
    targets = sitemaps.filter((s) => s.category.includes(CATEGORY) || s.group.includes(CATEGORY));
    if (targets.length === 0) {
      console.error(`No category matching "${CATEGORY}". Run with --list to see the options.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Matched ${targets.length} category/categories for "${CATEGORY}".`);
  }
  console.log(USE_AI ? 'AI fallback: on\n' : 'AI fallback: off\n');

  const collected = [];
  let skipped = 0;
  let aiRescued = 0;

  // In --all mode, resume each category where the last run stopped.
  // Without this, repeated runs would re-scrape the same opening
  // products of every category and never reach the rest.
  const supabase = DRY_RUN ? null : client();
  const progress = supabase && SCRAPE_ALL ? await loadProgress(supabase) : {};
  const progressUpdates = [];

  for (const sitemap of targets) {
    const cursor = progress[sitemap.category];
    if (SCRAPE_ALL && cursor?.exhausted) continue;

    const startIndex = SCRAPE_ALL ? cursor?.next_index || 0 : 0;
    const max = SCRAPE_ALL ? PER_CATEGORY : LIMIT;

    const all = await productUrlsFrom(sitemap.url);
    // null means the fetch failed — don't let a transient network error
    // look like "this category is finished".
    if (all === null) continue;

    const urls = all.slice(startIndex, startIndex + max);
    if (urls.length === 0) {
      if (SCRAPE_ALL && startIndex >= all.length) {
        progressUpdates.push({
          category: sitemap.category, sitemap_url: sitemap.url,
          next_index: startIndex, exhausted: true,
          products_saved: cursor?.products_saved || 0,
        });
      }
      continue;
    }

    console.log(`${sitemap.group}/${sitemap.category}  [${startIndex}-${startIndex + urls.length} of ${all.length}]`);
    let savedHere = 0;

    for (const url of urls) {
      const result = await scrapeProduct(url, sitemap.category, { useAI: USE_AI });
      await sleep(REQUEST_GAP_MS);

      if (result.error) {
        skipped++;
        continue;
      }

      collected.push(result.product);
      savedHere++;
      if (result.viaAI) aiRescued++;
      const p = result.product;
      console.log(`   ${result.viaAI ? 'ai ' : 'ok '} ${p.brand || '?'} — ${p.product_name}`);
      console.log(`        ${p.ingredients_text.replace(/\s+/g, ' ').slice(0, 100)}…`);
    }

    if (SCRAPE_ALL) {
      progressUpdates.push({
        category: sitemap.category, sitemap_url: sitemap.url,
        next_index: startIndex + urls.length,
        exhausted: false,
        products_saved: (cursor?.products_saved || 0) + savedHere,
      });
    }
  }

  // The same product can appear in more than one category; keep one row
  // per brand+name so the upsert doesn't fight itself in a single batch.
  const deduped = [...new Map(collected.map((p) => [`${p.brand}|${p.product_name}`, p])).values()];

  console.log(`\n${deduped.length} products with ingredients (${aiRescued} recovered by AI), ${skipped} skipped.`);

  if (DRY_RUN) {
    console.log('--dry-run: nothing written to the database.');
    return;
  }

  if (deduped.length > 0) {
    if (!(await save(deduped))) {
      // Leave the cursors untouched so the next run retries these rather
      // than skipping past products that were never stored.
      process.exitCode = 1;
      return;
    }
    console.log(`Saved ${deduped.length} products to blinkit_products.`);
  }

  // Advance even when nothing was saved — a stretch of products that
  // simply don't publish ingredients must not wedge the cursor.
  if (supabase && progressUpdates.length > 0) {
    await saveProgress(supabase, progressUpdates);
    const done = progressUpdates.filter((p) => p.exhausted).length;
    console.log(`Progress updated for ${progressUpdates.length} categories${done ? ` (${done} now complete)` : ''}.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
