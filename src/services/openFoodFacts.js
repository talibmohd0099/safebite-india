// src/services/openFoodFacts.js
// Free, open, crowdsourced product database — used as a barcode lookup
// so we don't need to ask the user to type or photograph a label when
// the product is already known. No API key needed.

const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

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

  const url = `${BASE_URL}/${encodeURIComponent(cleaned)}.json?fields=product_name,ingredients_text,brands`;

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

  if (!looksLikeValidIngredients(rawIngredients)) {
    return {
      found: true,
      productName,
      brand,
      ingredientsText: '',
      readable: false,
      notes: `This product's database entry looks wrong — it has "${rawIngredients.trim()}" listed instead of real ingredients (a mix-up in the crowdsourced data, not your scan). We found the product name, but please type or paste the actual ingredients from the pack below.`,
    };
  }

  return {
    found: true,
    productName,
    brand,
    ingredientsText: rawIngredients,
  };
}
