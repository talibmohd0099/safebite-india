// scripts/scrape-jiomart.js
//
// Walks JioMart's sitemap and saves brand / product name / ingredients /
// image into the SAME blinkit_products table scrape-blinkit.js uses
// (tagged source: 'jiomart' -- see
// supabase/blinkit_products_add_source_migration.sql) rather than a
// separate table: same shape, same purpose, no reason to duplicate the
// schema. Second, independent scraping source alongside blinkit.js --
// Blinkit started returning 403 Forbidden on 2026-09-10 (see
// .github/workflows/scrape-blinkit.yml), an active anti-scraping block,
// not a code bug. Rather than hammer the same blocked site again, this
// is a different retailer entirely.
//
// Progress cursors also share blinkit_seed_progress with the Blinkit
// scraper, one row per category -- since JioMart's real category names
// are unknown until a --list run, and could coincidentally collide with
// a Blinkit category name (both might have a "snacks", say), this
// script's cursor rows are keyed "jiomart:<category>" so the two
// scrapers' progress can never overwrite each other regardless of what
// JioMart's real taxonomy turns out to be.
//
// UNVERIFIED against real JioMart HTML -- see the header comment in
// src/services/jiomart.js for why (this was built in a sandbox that
// cannot reach jiomart.com at all) and what that means for how this
// should be run.
//
// ALWAYS start with --list. It fetches the real sitemap and prints
// what's actually there -- no assumption about category names is baked
// in anywhere else in this file. Do not run --all until a --list and a
// small --sitemap/--limit run have both been checked by hand.
//
// Usage:
//   node scripts/scrape-jiomart.js --list
//   node scripts/scrape-jiomart.js --sitemap <exact URL from --list> --limit 5 --dry-run
//   node scripts/scrape-jiomart.js --category groceries --limit 15
//   node scripts/scrape-jiomart.js --all --per-category 8

import { createClient } from '@supabase/supabase-js';

import {
  FOOD_GROUPS,
  getProductSitemaps,
  productUrlsFrom,
  scrapeProduct,
  sleep,
} from '../src/services/jiomart.js';

const REQUEST_GAP_MS = 1500; // be polite; this is someone else's server

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const CATEGORY = flag('category');
const SITEMAP = flag('sitemap'); // an exact sitemap URL, copy-pasted from --list output
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

// Prefixes this scraper's progress-cursor rows so they can never collide
// with a Blinkit category of the same name in the shared table.
const progressKey = (category) => `jiomart:${category}`;

/** Where each category got to last time -- shares blinkit_seed_progress with scrape-blinkit.js. */
async function loadProgress(supabase) {
  const { data, error } = await supabase
    .from('blinkit_seed_progress')
    .select('*')
    .like('category', 'jiomart:%');
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
    console.error('(Have blinkit_products_schema.sql, blinkit_products_migration.sql and');
    console.error(' blinkit_products_add_source_migration.sql all been run?)');
    return false;
  }
  return true;
}

async function main() {
  if (!DRY_RUN && !client()) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    console.error('Set them as repository secrets (Settings -> Secrets and variables -> Actions), or use --dry-run.');
    process.exitCode = 1;
    return;
  }

  const sitemaps = await getProductSitemaps();
  if (!sitemaps) {
    console.error('Could not fetch any JioMart sitemap. The candidate URLs in src/services/jiomart.js');
    console.error('(SITEMAP_CANDIDATES) may be wrong -- check https://www.jiomart.com/robots.txt for the real one.');
    process.exitCode = 1;
    return;
  }

  if (has('list') || (!CATEGORY && !SITEMAP && !SCRAPE_ALL)) {
    const byGroup = {};
    for (const s of sitemaps) (byGroup[s.group] ||= new Set()).add(s.category);
    console.log(`${sitemaps.length} sitemap(s) found.\n`);
    for (const [group, cats] of Object.entries(byGroup)) {
      console.log(`  ${group}`);
      console.log(`      ${[...cats].slice(0, 20).join(', ')}${cats.size > 20 ? `, +${cats.size - 20} more` : ''}`);
    }
    console.log('\nFOOD_GROUPS in src/services/jiomart.js is currently empty -- fill it in with the real');
    console.log('grocery/food category names from the list above once you know which ones actually are.');
    console.log('\n  node scripts/scrape-jiomart.js --sitemap <one URL from above> --limit 5 --dry-run');
    console.log('  node scripts/scrape-jiomart.js --all --per-category 8');
    return;
  }

  let targets;
  if (SITEMAP) {
    targets = sitemaps.filter((s) => s.url === SITEMAP);
    if (targets.length === 0) {
      console.error(`"${SITEMAP}" isn't one of the sitemap URLs --list found. Run --list and copy one exactly.`);
      process.exitCode = 1;
      return;
    }
  } else if (SCRAPE_ALL) {
    targets = FOOD_GROUPS.length > 0
      ? sitemaps.filter((s) => FOOD_GROUPS.includes(s.group))
      : sitemaps;
    if (FOOD_GROUPS.length === 0) {
      console.log('FOOD_GROUPS is empty -- walking every sitemap found, including non-food ones.');
      console.log('Fill in FOOD_GROUPS in src/services/jiomart.js once --list shows the real category names.\n');
    }
    console.log(`Walking ${targets.length} categor${targets.length === 1 ? 'y' : 'ies'}, up to ${PER_CATEGORY} products each.`);
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

  const supabase = DRY_RUN ? null : client();
  const progress = supabase && SCRAPE_ALL ? await loadProgress(supabase) : {};
  const progressUpdates = [];

  for (const sitemap of targets) {
    const cursor = progress[progressKey(sitemap.category)];
    if (SCRAPE_ALL && cursor?.exhausted) continue;

    const startIndex = SCRAPE_ALL ? cursor?.next_index || 0 : 0;
    const max = SCRAPE_ALL ? PER_CATEGORY : LIMIT;

    const all = await productUrlsFrom(sitemap.url);
    if (all === null) continue; // transient fetch failure, not "empty"

    const urls = all.slice(startIndex, startIndex + max);
    if (urls.length === 0) {
      if (SCRAPE_ALL && startIndex >= all.length) {
        progressUpdates.push({
          category: progressKey(sitemap.category), sitemap_url: sitemap.url,
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
        console.log(`   skip  ${url}  (${result.error})`);
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
        category: progressKey(sitemap.category), sitemap_url: sitemap.url,
        next_index: startIndex + urls.length,
        exhausted: false,
        products_saved: (cursor?.products_saved || 0) + savedHere,
      });
    }
  }

  const deduped = [...new Map(collected.map((p) => [`${p.brand}|${p.product_name}`, p])).values()];

  console.log(`\n${deduped.length} products with ingredients (${aiRescued} recovered by AI), ${skipped} skipped.`);

  if (DRY_RUN) {
    console.log('--dry-run: nothing written to the database.');
    return;
  }

  if (deduped.length > 0) {
    if (!(await save(deduped))) {
      process.exitCode = 1;
      return;
    }
    console.log(`Saved ${deduped.length} products to blinkit_products (source: jiomart).`);
  }

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
