// scripts/scrape-blinkit.js
//
// Pulls brand / product name / ingredients (plus nutrition and FSSAI
// licence, which come along for free) from Blinkit product pages into
// the blinkit_products table.
//
// Why this exists: Open Food Facts ingredient text is transcribed from
// photos of packs, which is where nearly every parsing bug we've hit
// comes from -- garbled brackets, missing commas, dropped ingredients.
// Blinkit's text is manufacturer-supplied, so it arrives clean.
//
// Discovery uses Blinkit's own published sitemaps rather than category
// pages: category listings vary by delivery location (so an anonymous
// request gets a different catalogue than you see logged in), while the
// sitemaps are static, organised by category, and are the mechanism a
// site publishes specifically for automated fetching. robots.txt
// disallows /s/* (search), which this script never touches.
//
// Usage:
//   node scripts/scrape-blinkit.js --list
//   node scripts/scrape-blinkit.js --category cold-drinks --limit 15
//   node scripts/scrape-blinkit.js --category biscuits --limit 25 --dry-run

import { createClient } from '@supabase/supabase-js';

const SITEMAP_INDEX = 'https://blinkit.com/sitemap.xml';
const USER_AGENT = 'Mozilla/5.0 (compatible; SafeBiteIndia/1.0; +ingredient research)';
const REQUEST_GAP_MS = 1500; // be polite; this is someone else's server

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const CATEGORY = flag('category');
const LIMIT = parseInt(flag('limit', '15'), 10);
const DRY_RUN = has('dry-run');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return await res.text();
    } catch {
      // network hiccup — fall through and retry
    }
    if (attempt < retries) await sleep(attempt * 1500);
  }
  return null;
}

/** Read a top-level JSON string field out of the embedded page data. */
function jsonField(html, key) {
  const match = html.match(new RegExp(`"${key}":("(?:[^"\\\\]|\\\\.)*")`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Read one of the product's labelled attributes ("Ingredients", "Energy",
 * "FSSAI License", ...). These sit in an attributes array on the page —
 * the same content the "View more details" button expands, which means
 * no browser or click is needed to get at it.
 */
function attribute(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(
    new RegExp(`"attribute_name":"${escaped}"[^}]*?"value":("(?:[^"\\\\]|\\\\.)*")`)
  );
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

const NUTRITION_FIELDS = [
  'Energy', 'Protein', 'Total Carbohydrates', 'Added Sugar', 'Total Sugar',
  'Total Fat', 'Saturated Fat', 'Trans Fat', 'Unsaturated Fat', 'Sodium', 'Calcium',
];

async function scrapeProduct(url, category) {
  const html = await fetchText(url);
  if (!html) return { url, error: 'fetch failed' };

  const ingredients = attribute(html, 'Ingredients');
  const productName = jsonField(html, 'product_name');

  if (!productName) return { url, error: 'no product name' };
  // The whole point is complete ingredient text — a row without it would
  // just be noise in the table.
  if (!ingredients || ingredients.length < 3) return { url, error: 'no ingredients listed', productName };

  const nutrition = {};
  for (const field of NUTRITION_FIELDS) {
    const value = attribute(html, field);
    if (value) nutrition[field] = value;
  }

  const idMatch = url.match(/\/prid\/(\d+)/);

  return {
    url,
    product: {
      blinkit_id: idMatch ? parseInt(idMatch[1], 10) : null,
      product_name: productName,
      brand: jsonField(html, 'brand'),
      unit: jsonField(html, 'unit'),
      ingredients_text: ingredients,
      category,
      image_url: jsonField(html, 'image_url'),
      nutrition,
      fssai_license: attribute(html, 'FSSAI License'),
      source_url: url,
      scraped_at: new Date().toISOString(),
    },
  };
}

async function getProductSitemaps() {
  const xml = await fetchText(SITEMAP_INDEX);
  if (!xml) throw new Error('Could not fetch the Blinkit sitemap index.');

  return (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
    .map((loc) => loc.replace(/<\/?loc>/g, ''))
    .filter((url) => url.includes('/sitemaps/products/'))
    .map((url) => {
      const parts = url.split('/sitemaps/products/')[1]?.split('/') || [];
      return { url, category: parts[1] || parts[0] || 'unknown', group: parts[0] || 'unknown' };
    });
}

async function main() {
  const sitemaps = await getProductSitemaps();

  if (has('list') || !CATEGORY) {
    console.log(`${sitemaps.length} product categories available:\n`);
    const byGroup = {};
    for (const s of sitemaps) (byGroup[s.group] ||= []).push(s.category);
    for (const [group, cats] of Object.entries(byGroup)) {
      console.log(`  ${group}`);
      console.log(`    ${[...new Set(cats)].join(', ')}`);
    }
    console.log('\nThen: node scripts/scrape-blinkit.js --category <name> --limit 15');
    return;
  }

  const matches = sitemaps.filter(
    (s) => s.category.includes(CATEGORY) || s.group.includes(CATEGORY)
  );
  if (matches.length === 0) {
    console.error(`No category matching "${CATEGORY}". Run with --list to see the options.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Matched ${matches.length} sitemap(s) for "${CATEGORY}":`);
  matches.slice(0, 5).forEach((m) => console.log(`  ${m.group}/${m.category}`));

  // Collect product URLs across the matched sitemaps.
  const productUrls = [];
  for (const sitemap of matches) {
    if (productUrls.length >= LIMIT) break;
    const xml = await fetchText(sitemap.url);
    await sleep(REQUEST_GAP_MS);
    if (!xml) continue;

    for (const loc of xml.match(/<loc>([^<]+)<\/loc>/g) || []) {
      const url = loc.replace(/<\/?loc>/g, '');
      if (!url.includes('/prid/')) continue;
      productUrls.push({ url, category: sitemap.category });
      if (productUrls.length >= LIMIT) break;
    }
  }

  console.log(`\nFetching ${productUrls.length} product pages...\n`);

  const scraped = [];
  let skipped = 0;
  for (const { url, category } of productUrls) {
    const result = await scrapeProduct(url, category);
    await sleep(REQUEST_GAP_MS);

    if (result.error) {
      skipped++;
      console.log(`  skip  ${result.productName || url.split('/prn/')[1] || url} — ${result.error}`);
      continue;
    }

    scraped.push(result.product);
    const p = result.product;
    console.log(`  ok    ${p.brand || '?'} — ${p.product_name}`);
    console.log(`        ${p.ingredients_text.slice(0, 110)}${p.ingredients_text.length > 110 ? '…' : ''}`);
  }

  console.log(`\n${scraped.length} with ingredients, ${skipped} skipped.`);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written to the database.');
    return;
  }
  if (scraped.length === 0) return;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('\nMissing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — nothing saved.');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key);
  const { error } = await supabase
    .from('blinkit_products')
    .upsert(scraped.filter((p) => p.blinkit_id), { onConflict: 'blinkit_id' });

  if (error) {
    console.error(`\nSave failed: ${error.message}`);
    console.error('(Has supabase/blinkit_products_schema.sql been run yet?)');
    process.exitCode = 1;
    return;
  }
  console.log(`Saved ${scraped.length} products to blinkit_products.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
