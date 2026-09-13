// src/services/jiomart.js
//
// Shared JioMart scraping logic, used by scripts/scrape-jiomart.js.
//
// Not imported by any app code — it never reaches the browser bundle.
//
// Why JioMart and not another retry at Blinkit: Blinkit started
// returning 403 Forbidden on every request as of 2026-09-10 (see
// .github/workflows/scrape-blinkit.yml) -- an active anti-scraping
// block from sustained request volume, not a code bug. Rather than
// hammering the same blocked site again, this is a second, independent
// source: manufacturer-supplied ingredient text and a clean e-commerce
// product photo, same reasoning as blinkit.js, different site.
//
// IMPORTANT — unlike blinkit.js, the extraction logic below has NOT been
// verified against real JioMart HTML. The sandbox this was written in
// cannot reach jiomart.com at all (org network policy), so there was no
// way to hand-inspect a real product page the way Blinkit's regexes
// were clearly built by someone who did. Instead of guessing at bespoke
// inline JSON field names (the way that would silently produce nothing
// if a single guess is wrong), extraction here is layered and defensive:
//
//   1. schema.org Product JSON-LD (<script type="application/ld+json">)
//      -- a W3C-ish standard most e-commerce sites embed for Google
//      Shopping/SEO, so far more likely to actually be present and
//      correctly named than a guessed bespoke field.
//   2. A generic "Ingredients" label search in the page's visible text,
//      for the ingredients list specifically (JSON-LD's Product schema
//      has no standard ingredients field).
//   3. Gemini extraction from the page's visible text as a last resort,
//      same "extract, never invent" contract as blinkit.js.
//
// Sitemap discovery is deliberately generic too (no assumed
// /group/category/ path convention) -- run with --list first to see
// JioMart's REAL sitemap/category structure before trusting anything
// else this file does. Treat the first real run as reconnaissance, not
// production seeding.

const SITEMAP_CANDIDATES = [
  'https://www.jiomart.com/sitemap.xml',
  'https://www.jiomart.com/sitemap_index.xml',
];

// A real browser UA, not a self-identifying bot string -- same reasoning
// as blinkit.js: a cloud CI runner's IP range is what anti-scraping
// systems flag hardest, and this is the one lever available against that.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// JioMart's real category taxonomy is unknown until a --list run against
// the live sitemap shows it -- unlike blinkit.js's FOOD_GROUPS, this
// starts empty on purpose. Fill in the real category/group names you see
// in a --list run's output; until then, --all matches nothing and only
// --category (substring match) or --sitemap (an exact URL from --list)
// can select anything, which is exactly the "look before seeding" this
// file's header comment asks for.
export const FOOD_GROUPS = [];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, retries = 3) {
  let lastFailure = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return await res.text();
      lastFailure = `HTTP ${res.status} ${res.statusText}`;
    } catch (err) {
      lastFailure = `${err.name}: ${err.message}`;
    }
    if (attempt < retries) await sleep(attempt * 1200);
  }

  // Surfaced so a genuine block (403/429) is visible instead of looking
  // identical to a transient network blip -- the exact failure mode that
  // took a while to notice with Blinkit.
  if (lastFailure) console.error(`[jiomart] fetch failed for ${url}: ${lastFailure}`);
  return null;
}

/** All <loc> entries directly inside a sitemap XML document (index or leaf). */
function extractLocs(xml) {
  return (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map((loc) => loc.replace(/<\/?loc>/g, '').trim());
}

/**
 * Every product-page sitemap reachable from the site's sitemap index(es).
 * Deliberately makes no assumption about URL path conventions (Blinkit's
 * /sitemaps/products/<group>/<category>/ shape may not exist here) --
 * returns every leaf sitemap found, tagged only with its own URL. Group
 * these into meaningful categories AFTER a --list run shows what's real.
 */
export async function getProductSitemaps() {
  const leaves = [];

  for (const indexUrl of SITEMAP_CANDIDATES) {
    const xml = await fetchText(indexUrl);
    if (!xml) continue;

    const locs = extractLocs(xml);
    if (locs.length === 0) continue;

    // A sitemap index nests further sitemaps; a leaf sitemap lists actual
    // pages directly. Tell them apart by whether Google's sitemap index
    // tag wraps the <loc> entries, not by guessing from the URL text.
    const isIndex = /<sitemapindex/i.test(xml);

    if (!isIndex) {
      leaves.push({ url: indexUrl, group: 'root', category: 'root' });
      continue;
    }

    for (const loc of locs) {
      // Best-effort label from the URL's own path/filename -- purely for
      // human-readable --list output, not used to decide what to scrape.
      const slug = loc.replace(/^https?:\/\/[^/]+\//, '').replace(/\.xml.*$/i, '');
      const parts = slug.split('/').filter(Boolean);
      leaves.push({ url: loc, group: parts[0] || slug, category: parts[parts.length - 1] || slug });
    }
  }

  return leaves.length > 0 ? leaves : null;
}

/**
 * Page URLs listed in one leaf sitemap. Returns null (not []) when the
 * fetch itself failed, so callers can tell a transient network problem
 * apart from a genuinely empty sitemap.
 */
export async function productUrlsFrom(sitemapUrl) {
  const xml = await fetchText(sitemapUrl);
  if (!xml) return null;
  return extractLocs(xml);
}

/**
 * Pull every schema.org Product JSON-LD block out of a page. A page can
 * legitimately embed more than one <script type="application/ld+json">
 * tag (breadcrumbs, organization, product) -- only the Product one is
 * useful here.
 */
function productJsonLd(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const inner = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>\s*$/i, '');
    let parsed;
    try {
      parsed = JSON.parse(inner);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
    const product = candidates.find((c) => {
      const type = c?.['@type'];
      return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
    });
    if (product) return product;
  }
  return null;
}

/**
 * Best-effort "Ingredients" section out of a page's visible text. There
 * is no standard schema.org field for a grocery ingredients list, so
 * this looks for the word itself acting as a label (":" or line break
 * after it) and captures up to the next all-caps/label-like line or a
 * sane length cap, same shape as blinkit.js's structured-attribute
 * lookup but working off raw text instead of a known JSON field.
 */
function ingredientsFromText(text) {
  const match = text.match(/ingredients?\s*[:-]\s*([^\n]{12,1000})/i);
  if (!match) return null;
  // Trim at the next likely section label so a run-on page (nutrition
  // facts, allergen note) immediately after doesn't get swallowed too.
  const value = match[1].split(/\b(?:nutritional|nutrition facts|allergen|storage|net quantity|fssai)\b/i)[0].trim();
  return value.length >= 12 ? value : null;
}

/** Strip tags/scripts down to plain visible-ish text, for the regex/AI fallbacks. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const AI_PROMPT = `You are reading the product information from an Indian grocery listing and pulling out the ingredients list, if one is present.

Rules:
- Return ONLY the ingredients list, exactly as written in the text you are given.
- Do NOT invent, infer, complete or guess ingredients. If the text does not contain an actual ingredients list, return exactly: NONE
- A description of the product ("refreshing cola drink", "made with real fruit") is NOT an ingredients list. Return NONE for those.
- Do not add commentary, labels or markdown. Just the ingredients text, or NONE.`;

/**
 * Last resort for products with no "Ingredients" label found in the raw
 * text: show Gemini the page's visible text and let it find an
 * ingredients list inside it. Extraction only, same contract as
 * blinkit.js's extractIngredientsWithAI -- it's told to return NONE
 * rather than infer anything.
 */
export async function extractIngredientsWithAI(productName, text) {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const shown = text.slice(0, 4000);
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

    const text2 = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text2 || /^NONE\b/i.test(text2) || text2.length < 12) return null;
    return text2;
  } catch {
    return null;
  }
}

/**
 * Scrape one product page into a blinkit_products row (source: 'jiomart') --
 * this and blinkit.js's scrapeProduct share that one table; see
 * supabase/blinkit_products_add_source_migration.sql for why.
 * Returns { error } when there's nothing usable to save.
 */
export async function scrapeProduct(url, category, { useAI = false } = {}) {
  const html = await fetchText(url);
  if (!html) return { error: 'fetch failed' };

  const product = productJsonLd(html);
  const text = visibleText(html);

  const productName = product?.name || null;
  if (!productName) return { error: 'no product name (no Product JSON-LD found on this page)' };

  let ingredients = ingredientsFromText(text);
  let viaAI = false;

  if (!ingredients && useAI) {
    ingredients = await extractIngredientsWithAI(productName, text);
    viaAI = Boolean(ingredients);
  }

  // The whole point is complete ingredient text — a row without it would
  // just be noise in the table.
  if (!ingredients || ingredients.length < 12) {
    return { error: 'no ingredients found', productName };
  }

  const brand = typeof product?.brand === 'string' ? product.brand : product?.brand?.name || '';
  const image = Array.isArray(product?.image) ? product.image[0] : product?.image;

  return {
    viaAI,
    product: {
      product_name: productName,
      brand,
      ingredients_text: ingredients,
      category,
      image_url: image || null,
      source: 'jiomart',
      scraped_at: new Date().toISOString(),
    },
  };
}
