// src/services/openFoodFacts.js
// Free, open, crowdsourced product database — used as a barcode lookup
// so we don't need to ask the user to type or photograph a label when
// the product is already known. No API key needed.

const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

// Being crowdsourced, some Open Food Facts entries have nutrition facts
// (energy, protein, etc.) mistakenly saved in the ingredients field
// instead of the actual ingredients. This is a rough sanity check to
// catch that before we hand it to the user as if it were reliable.
const NUTRITION_ONLY_WORDS = new Set([
  'energy', 'protein', 'protrin', 'carbohydrate', 'carbohydrates', 'fat', 'fats',
  'fibre', 'fiber', 'sodium', 'calories', 'kcal', 'sugar', 'sugars', 'cholesterol',
]);

function looksLikeValidIngredients(text) {
  const cleaned = text.trim();
  if (cleaned.length < 15) return false;

  const words = cleaned.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const nutritionWordCount = words.filter((w) => NUTRITION_ONLY_WORDS.has(w.toLowerCase())).length;

  // No commas at all AND mostly nutrition-facts words -> almost certainly
  // a mis-entered nutrition table, not an ingredients list.
  if (!cleaned.includes(',') && (nutritionWordCount / words.length > 0.5 || words.length < 4)) {
    return false;
  }

  return true;
}

/**
 * Look up a product by barcode. Returns { found: false } if the
 * product isn't in the database (common for Indian regional/local
 * brands — Open Food Facts coverage is community-submitted).
 */
export async function lookupBarcode(barcode) {
  const cleaned = barcode.trim();
  if (!cleaned) return { found: false };

  const url = `${BASE_URL}/${encodeURIComponent(cleaned)}.json?fields=product_name,ingredients_text,brands,ingredients,image_front_url`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Could not reach the product database. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error('Product lookup failed. Please try again.');
  }

  const data = await response.json();

  if (data.status !== 1 || !data.product?.ingredients_text) {
    return { found: false };
  }

  const rawIngredients = data.product.ingredients_text;
  const productName = data.product.product_name || 'Unknown Product';
  // "brands" is sometimes a messy comma-separated tag list (e.g.
  // "Sunfeast, Sunfeast is sold by ITC Limited") -- take just the first,
  // cleanest-looking entry.
  const brand = data.product.brands ? data.product.brands.split(',')[0].trim() || null : null;
  const imageUrl = data.product.image_front_url || null;

  if (!looksLikeValidIngredients(rawIngredients)) {
    return {
      found: true,
      productName,
      brand,
      imageUrl,
      ingredientsText: '',
      readable: false,
      notes: `This product's database entry looks wrong — it has "${rawIngredients.trim()}" listed instead of real ingredients (a mix-up in the crowdsourced data, not your scan). We found the product name, but please type or paste the actual ingredients from the pack below.`,
    };
  }

  return {
    found: true,
    productName,
    brand,
    imageUrl,
    ingredientsText: rawIngredients,
    offIngredients: data.product.ingredients || null,
  };
}

/**
 * Search Indian products by name, for the type-ahead suggestions on the
 * home screen. Only returns products we can actually analyze — an entry
 * with no usable ingredients list would just dead-end the user after
 * they picked it, so it's filtered out here rather than shown.
 */
export async function searchProductsByName(query, { limit = 8 } = {}) {
  const cleaned = (query || '').trim();
  if (cleaned.length < 2) return [];

  const params = new URLSearchParams({
    search_terms: cleaned,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '24',
    countries_tags_en: 'India',
    fields: 'code,product_name,brands,ingredients_text,ingredients,image_front_url',
  });

  // This endpoint returns intermittent 503s under load — the identical
  // query often succeeds moments later. One quick retry absorbs most of
  // them; more than that would make the type-ahead feel sluggish.
  let response = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      response = await fetch(`${SEARCH_URL}?${params.toString()}`);
    } catch {
      throw new Error('Could not reach the product database. Check your connection and try again.');
    }
    if (response.ok) break;
  }
  if (!response?.ok) {
    throw new Error('Product search is busy right now. Try again in a moment.');
  }

  const data = await response.json();
  const results = [];
  const seen = new Set();

  for (const p of data?.products || []) {
    if (results.length >= limit) break;
    if (!p.code || !p.product_name?.trim()) continue;
    if (!p.ingredients_text || !looksLikeValidIngredients(p.ingredients_text)) continue;

    // Open Food Facts carries a lot of near-duplicate entries for the
    // same product — collapse them so the list isn't three identical rows.
    const name = p.product_name.trim();
    const dedupeKey = `${name.toLowerCase()}|${(p.brands || '').toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      code: p.code,
      productName: name,
      brand: p.brands ? p.brands.split(',')[0].trim() || null : null,
      imageUrl: p.image_front_url || null,
      ingredientsText: p.ingredients_text,
      offIngredients: p.ingredients || null,
    });
  }

  return results;
}

function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Open Food Facts nests sub-ingredients (e.g. "Edible Vegetable Oil" ->
// "Palm Oil") inside the same array shape -- flatten it so matching just
// searches one flat list instead of walking the tree by hand.
function flattenOffIngredients(offIngredients) {
  const flat = [];
  const walk = (list) => {
    for (const entry of list || []) {
      flat.push(entry);
      if (Array.isArray(entry.ingredients)) walk(entry.ingredients);
    }
  };
  walk(offIngredients);
  return flat;
}

// Open Food Facts' taxonomy ids for additives look like "en:e223" or
// "en:e503ii" -- pull just the code part so it can be compared against
// our own insCode format ("223", "503(ii)") after normalizing both.
function insCodeFromOffId(id) {
  if (!id || !/^en:e\d/i.test(id)) return null;
  return id.replace(/^en:e/i, '');
}

/**
 * Fill in `percentage` on parsed ingredients using Open Food Facts'
 * algorithmic percent_estimate, wherever the label itself didn't state
 * one and we can confidently match an entry against it. Never overrides
 * a percentage already read straight off the label -- the real printed
 * number always wins over an estimate, and a failed match just leaves
 * the ingredient as-is rather than guessing wrong.
 */
export function applyOffPercentEstimates(parsedIngredients, offIngredients) {
  const flat = flattenOffIngredients(offIngredients);
  if (flat.length === 0) return parsedIngredients;

  return parsedIngredients.map((item) => {
    if (typeof item.percentage === 'number') return item;

    let match = null;

    if (item.insCode) {
      const target = normalizeForMatch(item.insCode);
      match = flat.find((f) => normalizeForMatch(insCodeFromOffId(f.id)) === target) || null;
    }

    if (!match) {
      const target = normalizeForMatch(item.canonicalName);
      if (target.length >= 3) {
        const candidates = flat
          .map((f) => ({
            entry: f,
            candidate: normalizeForMatch((f.id || '').replace(/^en:/, '').replace(/-/g, ' ')) || normalizeForMatch(f.text),
          }))
          .filter((c) => c.candidate.length >= 3 && (target.includes(c.candidate) || c.candidate.includes(target)))
          .sort((a, b) => b.candidate.length - a.candidate.length); // prefer the more specific match
        match = candidates[0]?.entry || null;
      }
    }

    if (!match || typeof match.percent_estimate !== 'number') return item;
    return { ...item, percentage: match.percent_estimate };
  });
}
