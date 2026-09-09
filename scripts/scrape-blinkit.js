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

async function save(products) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — nothing saved.');
    return false;
  }

  const supabase = createClient(url, key);
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

  for (const sitemap of targets) {
    const max = SCRAPE_ALL ? PER_CATEGORY : LIMIT;
    const all = await productUrlsFrom(sitemap.url);
    const urls = (all || []).slice(0, max);
    if (urls.length === 0) continue;

    console.log(`${sitemap.group}/${sitemap.category}`);

    for (const url of urls) {
      const result = await scrapeProduct(url, sitemap.category, { useAI: USE_AI });
      await sleep(REQUEST_GAP_MS);

      if (result.error) {
        skipped++;
        continue;
      }

      collected.push(result.product);
      if (result.viaAI) aiRescued++;
      const p = result.product;
      console.log(`   ${result.viaAI ? 'ai ' : 'ok '} ${p.brand || '?'} — ${p.product_name}`);
      console.log(`        ${p.ingredients_text.replace(/\s+/g, ' ').slice(0, 100)}…`);
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
  if (deduped.length === 0) return;

  if (await save(deduped)) {
    console.log(`Saved ${deduped.length} products to blinkit_products.`);
  } else {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
