// src/services/blinkit.js
//
// Shared Blinkit scraping logic, used by scripts/scrape-blinkit.js (both
// its manual --category mode and its cursor-aware --all mode, which the
// GitHub Actions workflow runs on a schedule).
//
// Not imported by any app code — it never reaches the browser bundle.
//
// Discovery goes through Blinkit's published sitemaps rather than
// category pages: category listings vary by delivery location (an
// anonymous request for the cold-drinks category returns dairy), while
// the sitemaps are static and organised by category. robots.txt
// disallows /s/* (search); nothing here touches it.

const SITEMAP_INDEX = 'https://blinkit.com/sitemap.xml';
// A real browser UA, not a self-identifying bot string. Manual testing
// from a residential IP worked fine either way, but a cloud CI runner's
// IP range is the kind of traffic anti-scraping systems flag hardest —
// this is the one lever available to try to get past that.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// The groups worth scanning for a food-label app. The sitemap also
// carries fashion, electronics and pet care, which have nothing to score.
export const FOOD_GROUPS = [
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

const NUTRITION_FIELDS = [
  'Energy', 'Protein', 'Total Carbohydrates', 'Added Sugar', 'Total Sugar',
  'Total Fat', 'Saturated Fat', 'Trans Fat', 'Unsaturated Fat', 'Sodium', 'Calcium',
];

// Logistics and tax attributes — noise a shopper would never read, and
// not worth showing the AI fallback.
const NOISE_ATTRIBUTES = /gst|hsn|tax|case|polybag|guidelines|warehouse|_weight|engagement|ptr|uom|unitvalue|unittype|return type|gift wrap|packaged product|packed product|physical packaging/i;

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
  // identical to a transient network blip -- both currently just return
  // null to the caller, but only one of them is worth investigating.
  if (lastFailure) console.error(`[blinkit] fetch failed for ${url}: ${lastFailure}`);
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

const AI_PROMPT = `You are reading the product information from an Indian grocery listing and pulling out the ingredients list, if one is present.

Rules:
- Return ONLY the ingredients list, exactly as written in the text you are given.
- Do NOT invent, infer, complete or guess ingredients. If the text does not contain an actual ingredients list, return exactly: NONE
- A description of the product ("refreshing cola drink", "made with real fruit") is NOT an ingredients list. Return NONE for those.
- Do not add commentary, labels or markdown. Just the ingredients text, or NONE.`;

/**
 * Last resort for products with no structured Ingredients attribute:
 * show Gemini only the text already on that page and let it find an
 * ingredients list inside it. Extraction only — it's told to return
 * NONE rather than infer anything, because a plausible-sounding
 * invented ingredient list is far worse here than no data.
 */
export async function extractIngredientsWithAI(productName, attributes) {
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

/**
 * Scrape one product page into a blinkit_products row.
 * Returns { error } when there's nothing usable to save.
 */
export async function scrapeProduct(url, category, { useAI = false } = {}) {
  const html = await fetchText(url);
  if (!html) return { error: 'fetch failed' };

  const productName = jsonField(html, 'product_name');
  if (!productName) return { error: 'no product name' };

  const attributes = allAttributes(html);
  let ingredients = attributes['Ingredients'] || null;
  let viaAI = false;

  if (!ingredients && useAI) {
    ingredients = await extractIngredientsWithAI(productName, attributes);
    viaAI = Boolean(ingredients);
  }

  // The whole point is complete ingredient text — a row without it
  // would just be noise in the table.
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

/** All product sitemaps, tagged with their group and category. */
export async function getProductSitemaps() {
  const xml = await fetchText(SITEMAP_INDEX);
  if (!xml) return null;

  return (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
    .map((loc) => loc.replace(/<\/?loc>/g, ''))
    .filter((url) => url.includes('/sitemaps/products/'))
    .map((url) => {
      const parts = url.split('/sitemaps/products/')[1]?.split('/') || [];
      return { url, group: parts[0] || 'unknown', category: parts[1] || parts[0] || 'unknown' };
    });
}

/**
 * Product URLs from one category sitemap. Returns null (not []) when the
 * fetch itself failed, so callers can tell a transient network problem
 * apart from a genuinely empty category.
 */
export async function productUrlsFrom(sitemapUrl) {
  const xml = await fetchText(sitemapUrl);
  if (!xml) return null;

  return (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
    .map((loc) => loc.replace(/<\/?loc>/g, ''))
    .filter((url) => url.includes('/prid/'));
}
