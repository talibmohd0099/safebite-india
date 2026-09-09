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

const SITEMAP_INDEX = 'https://blinkit.com/sitemap.xml';
const USER_AGENT = 'Mozilla/5.0 (compatible; SafeBiteIndia/1.0; +ingredient research)';
const REQUEST_GAP_MS = 1500; // be polite; this is someone else's server

const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// The groups worth scanning for a food-label app. The sitemap also
// carries fashion, electronics, pet care and so on, which have nothing
// to score.
const FOOD_GROUPS = [
  'atta-rice-dal',
  'bakery-biscuits',
  'cold-drinks-juices',
  'dairy-breakfast',
  'dry-fruits-masala-oil',
  'instant-frozen-food',
  'munchies',
  'sauces-spreads',
  'sweet-tooth',
  'tea-coffee-milk-drinks',
];

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
 * Every labelled attribute on the page. This is the same content the
 * "View more details" button expands — it's already in the HTML, so no
 * browser or click is needed to reach it.
 */
function allAttributes(html) {
  const out = {};
  const re = /"attribute_name":"([^"]+)"[^}]*?"value":("(?:[^"\\]|\\.)*")/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (out[m[1]] !== undefined) continue;
    try {
      const value = JSON.parse(m[2]).trim();
      if (value) out[m[1]] = value;
    } catch {
      // skip anything that won't parse
    }
  }
  return out;
}

const NUTRITION_FIELDS = [
  'Energy', 'Protein', 'Total Carbohydrates', 'Added Sugar', 'Total Sugar',
  'Total Fat', 'Saturated Fat', 'Trans Fat', 'Unsaturated Fat', 'Sodium', 'Calcium',
];

// Attributes that are logistics/tax noise rather than anything a
// shopper would read — excluded from what Gemini gets shown.
const NOISE_ATTRIBUTES = /gst|hsn|tax|case|polybag|guidelines|warehouse|_weight|engagement|ptr|uom|unitvalue|unittype|return type|gift wrap|packaged product|packed product|physical packaging/i;

const AI_PROMPT = `You are reading the product information from an Indian grocery listing and pulling out the ingredients list, if one is present.

Rules:
- Return ONLY the ingredients list, exactly as written in the text you are given.
- Do NOT invent, infer, complete or guess ingredients. If the text does not contain an actual ingredients list, return exactly: NONE
- A description of the product ("refreshing cola drink", "made with real fruit") is NOT an ingredients list. Return NONE for those.
- Do not add commentary, labels or markdown. Just the ingredients text, or NONE.`;

async function extractIngredientsWithAI(productName, attributes) {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const shown = Object.entries(attributes)
    .filter(([name]) => !NOISE_ATTRIBUTES.test(name))
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n')
    .slice(0, 4000);

  if (!shown.trim()) return null;

  const body = {
    contents: [{ parts: [{ text: `${AI_PROMPT}\n\nProduct: ${productName}\n\n${shown}` }] }],
    generationConfig: {
      temperature: 0,
      topK: 1,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data.candidates?.[0]?.finishReason !== 'STOP') return null;

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || /^NONE\b/i.test(text) || text.length < 12) return null;
    return text;
  } catch {
    return null;
  }
}

async function scrapeProduct(url, category) {
  const html = await fetchText(url);
  if (!html) return { error: 'fetch failed' };

  const productName = jsonField(html, 'product_name');
  if (!productName) return { error: 'no product name' };

  const attributes = allAttributes(html);
  let ingredients = attributes['Ingredients'] || null;
  let viaAI = false;

  if (!ingredients && USE_AI) {
    ingredients = await extractIngredientsWithAI(productName, attributes);
    viaAI = Boolean(ingredients);
  }

  if (!ingredients || ingredients.length < 12) {
    return { error: 'no ingredients listed', productName };
  }

  const nutrition = {};
  for (const field of NUTRITION_FIELDS) {
    if (attributes[field]) nutrition[field] = attributes[field];
  }

  return {
    viaAI,
    product: {
      product_name: productName,
      brand: jsonField(html, 'brand') || '',
      ingredients_text: ingredients,
      category,
      image_url: jsonField(html, 'image_url'),
      nutrition,
      fssai_license: attributes['FSSAI License'] || null,
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
      return { url, group: parts[0] || 'unknown', category: parts[1] || parts[0] || 'unknown' };
    });
}

async function productUrlsFrom(sitemap, max) {
  const xml = await fetchText(sitemap.url);
  await sleep(REQUEST_GAP_MS);
  if (!xml) return [];

  const urls = [];
  for (const loc of xml.match(/<loc>([^<]+)<\/loc>/g) || []) {
    const url = loc.replace(/<\/?loc>/g, '');
    if (url.includes('/prid/')) urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

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
    const urls = await productUrlsFrom(sitemap, max);
    if (urls.length === 0) continue;

    console.log(`${sitemap.group}/${sitemap.category}`);

    for (const url of urls) {
      const result = await scrapeProduct(url, sitemap.category);
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
