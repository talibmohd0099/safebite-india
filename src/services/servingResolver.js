// src/services/servingResolver.js
//
// "What is ONE serving of this product?" -- answered in three steps,
// most trustworthy first, and always saying which step it came from so
// the UI can be honest about it:
//
//   1. 'label'    -- the serving the product's own data states, if it's
//                    believable (see isPlausibleLabelServing).
//   2. 'pack'     -- the whole pack, when the pack is small enough to
//                    be one serving by itself (a Rs10 chips packet, a
//                    22g KitKat, a 200ml tetra pack). A label fact.
//   3. 'standard' -- the typical serving for that kind of product: an
//                    ESTIMATE, and the UI must say so.
//
// Why this exists: 4,551 of 6,070 products had no serving at all, 174
// had a "serving" of exactly 100 (the per-100g basis mislabelled), and
// some had the whole pack weight as their serving (openFoodFacts.js
// falls back to product_quantity) -- a 400g Hide & Seek family pack
// read as one serving.
//
// The 'standard' numbers are NOT imported from a foreign table: they're
// the median of the real serving sizes printed on Indian labels already
// in this catalog (~1,300 products with a believable label serving),
// per category -- e.g. biscuits 20g, chocolate 28g, chips 28g, cereal
// 38g, ice cream 65g, yogurt 85g, drinks 180ml. Rounded to clean
// numbers. Pure, no network.

// Checked in order -- the first name match wins. Order matters: "Dairy
// Milk" is a chocolate, "Milk Bikis" is a biscuit, before either could
// match the milk-drink rule.
const CATEGORIES = [
  { id: 'ice-cream', re: /\b(ice ?creams?|kulfi|frozen desserts?|sundae|cones?)\b/i, standard: 65, unit: 'ml', singleServeMax: 150 },
  // Before chocolate so "chocolate eclairs/toffee" count as a couple of
  // pieces, not a bar -- and a 50g tin of candies isn't one serving
  // (live: a Barkleys mint tin read as 10.6 tsp).
  { id: 'candy', re: /\b(candy|candies|toffees?|lollipops?|lollies|gumm(?:y|ies)|jelly beans?|eclairs?|chewing gum|bubble gum|pastilles?)\b/i, standard: 10, unit: 'g', singleServeMax: 15 },
  { id: 'chocolate', re: /\b(chocolates?|choco|kitkat|dairy milk|munch|5 star|perk|truffles?)\b/i, standard: 30, unit: 'g', singleServeMax: 60 },
  // "bikis": Britannia Milk Bikis has no "biscuit" in its name, and its
  // "Milk" otherwise matched the milk-drink rule (live: 180ml, 10 tsp).
  { id: 'biscuit', re: /\b(biscuits?|bikis|cookies?|crackers?|rusks?|wafers?|bourbon)\b/i, standard: 20, unit: 'g', singleServeMax: 60 },
  { id: 'cake', re: /\b(cakes?|brownies?|muffins?|pastry|pastries|swiss roll)\b/i, standard: 40, unit: 'g', singleServeMax: 80 },
  { id: 'cereal', re: /\b(cereals?|flakes|muesli|granola|chocos)\b/i, standard: 40, unit: 'g', singleServeMax: 60 },
  { id: 'yogurt', re: /\b(yogh?urts?|curd|dahi|mishti doi|shrikhand)\b/i, standard: 85, unit: 'g', singleServeMax: 200 },
  { id: 'milk-drink', drinkOnly: true, re: /\b(milk|lassi|milkshake|shakes?|smoothies?|buttermilk|chaas)\b/i, standard: 180, unit: 'ml', singleServeMax: 250 },
  { id: 'drink', drinkOnly: true, re: /\b(juices?|drinks?|soda|cola|lemonade|nectar|iced tea|energy drink|soft drink|mocktail|coconut water)\b/i, standard: 180, unit: 'ml', singleServeMax: 350 },
  { id: 'chips', re: /\b(chips|crisps|namkeen|bhujia|mixture|nachos|puffs|popcorn|sev|chakli|mathri)\b/i, standard: 30, unit: 'g', singleServeMax: 60 },
];

// Drink categories only apply to something that IS a drink -- a real
// catch: 'Britannia Milk Bikis' (a biscuit, no 'biscuit' in its name)
// matched the milk-drink rule and got a 180ml serving.
const DRINK_FOOD_TYPES = new Set(['beverage', 'dairy']);

// Fallback by the report's own foodType when the name matched nothing.
// 'other'/missing deliberately has NO standard: it's a catch-all, and
// guessing a serving for something we can't even categorise would be
// inventing a number.
const BY_FOOD_TYPE = {
  'sweet-snack': { standard: 20, unit: 'g', singleServeMax: 60 },
  'fried-snack': { standard: 30, unit: 'g', singleServeMax: 60 },
  'baked-snack': { standard: 25, unit: 'g', singleServeMax: 60 },
  staple: { standard: 40, unit: 'g', singleServeMax: 60 },
  'ready-meal': { standard: 60, unit: 'g', singleServeMax: 400 },
  beverage: { standard: 180, unit: 'ml', singleServeMax: 350 },
  dairy: { standard: 50, unit: 'g', singleServeMax: 200 },
  'nuts-seeds': { standard: 25, unit: 'g', singleServeMax: 50 },
  other: { standard: null, unit: 'g', singleServeMax: 60 },
};

// The largest amount still believably ONE serving, by food type --
// past this, a stated serving is treated as a pack weight in disguise.
const MAX_PLAUSIBLE_SERVING = {
  'fried-snack': 100,
  'sweet-snack': 100,
  'baked-snack': 100,
  'nuts-seeds': 100,
  staple: 100,
  dairy: 300,
  beverage: 600,
  'ready-meal': 450,
};
const MAX_PLAUSIBLE_SERVING_DEFAULT = 150;

// Below this nothing is a real serving of food -- 97 Blinkit rows have
// a "Standard Serve Size" of "1 g".
const MIN_PLAUSIBLE_SERVING = 5;

function categoryFor(report) {
  const name = report.productName || '';
  const byName = CATEGORIES.find((c) => c.re.test(name) && (!c.drinkOnly || !report.foodType || DRINK_FOOD_TYPES.has(report.foodType)));
  if (byName) return byName;
  return BY_FOOD_TYPE[report.foodType] || BY_FOOD_TYPE.other;
}

/** A stated serving we can trust: not the per-100 basis, not junk, not a pack weight. */
export function isPlausibleLabelServing(grams, foodType) {
  if (typeof grams !== 'number' || !Number.isFinite(grams)) return false;
  if (grams === 100) return false;
  if (grams < MIN_PLAUSIBLE_SERVING) return false;
  return grams <= (MAX_PLAUSIBLE_SERVING[foodType] ?? MAX_PLAUSIBLE_SERVING_DEFAULT);
}

/**
 * The single-unit size from a pack-size string. "6 x 30 g" -> 30 g (the
 * first number that carries a unit is the per-unit size), "1 kg" ->
 * 1000 g, "200 ml" -> 200 ml.
 */
export function parsePackSize(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|grams?|ml|l|ltr|litres?|liters?)\b/i);
  if (!m) return null;
  let value = Number(m[1]);
  const u = m[2].toLowerCase();
  const isLiquid = u === 'ml' || u === 'l' || u.startsWith('lt') || u.startsWith('lit');
  if (u === 'kg' || u === 'kgs' || u === 'l' || u.startsWith('lt') || u.startsWith('lit')) value *= 1000;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: isLiquid ? 'ml' : 'g' };
}

/**
 * @returns {null | { grams: number, unit: 'g'|'ml', source: 'label'|'pack'|'standard' }}
 */
export function resolveServing(report) {
  if (!report) return null;
  const category = categoryFor(report);

  const labelGrams = report.realNutrientsServingGrams;
  if (isPlausibleLabelServing(labelGrams, report.foodType)) {
    return { grams: labelGrams, unit: report.realNutrientsServingUnit || 'g', source: 'label' };
  }

  const pack = parsePackSize(report.packSize);
  if (pack && pack.value >= MIN_PLAUSIBLE_SERVING && pack.value <= category.singleServeMax) {
    return { grams: pack.value, unit: pack.unit, source: 'pack' };
  }

  if (category.standard) {
    return { grams: category.standard, unit: category.unit, source: 'standard' };
  }
  return null;
}
