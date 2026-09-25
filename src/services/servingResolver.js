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
  // "diary milk": a real catalog typo ("Diary Milk Silk") that otherwise
  // read as a 180ml milk drink.
  { id: 'chocolate', re: /\b(chocolates?|choco|kitkat|(?<!mother )dairy milk|diary milk|munch|5 star|perk|truffles?)\b/i, standard: 30, unit: 'g', singleServeMax: 60 },
  // "bikis": Britannia Milk Bikis has no "biscuit" in its name, and its
  // "Milk" otherwise matched the milk-drink rule (live: 180ml, 10 tsp).
  { id: 'biscuit', re: /\b(biscuits?|bikis|cookies?|crackers?|rusks?|wafers?|bourbon)\b/i, standard: 20, unit: 'g', singleServeMax: 60 },
  // \w*cakes? catches "Teacake"/"Cupcake", which have no word boundary
  // before "cake" (live: a 180g Mawa Teacake read as one serving).
  { id: 'cake', re: /(\w*cakes?\b|\bbrownies?\b|\bmuffins?\b|\bpastry\b|\bpastries\b|\bswiss roll\b)/i, standard: 40, unit: 'g', singleServeMax: 80 },
  { id: 'cereal', re: /\b(cereals?|(?<!chil+i |oregano |herb |fish )flakes|muesli|granola|chocos)\b/i, standard: 40, unit: 'g', singleServeMax: 60 },
  // After biscuit/cake so "Butter Cookies" stays a biscuit. A 200g cheese
  // block is several servings, not one (live: read as one serving = 15
  // tsp of oil's fat). Median real label serving: 28g; only a single
  // cube/slice pack counts as one serving by itself.
  { id: 'cheese', re: /\bcheese\b/i, standard: 25, unit: 'g', singleServeMax: 30 },
  // Its own kind so a cheese snack is never "swapped" for paneer.
  { id: 'paneer', re: /\bpaneer\b/i, standard: 25, unit: 'g', singleServeMax: 30 },
  // Frozen snack packs (360g nuggets, 400g seekh kebab) are several
  // servings. Median real label serving: 84g. Not bare "frozen" -- frozen
  // peas or grated coconut are cooking ingredients, not snacks.
  { id: 'frozen-snack', re: /\b(nuggets|kebabs?|seekh|patty|patties|fries|momos|tikki|sausages?|salami|cutlets?|potato bites|frozen snacks?|breaded|prawns|fish fingers|chicken wings|popcorn chicken)\b/i, standard: 85, unit: 'g', singleServeMax: 150 },
  // Median real label serving 70g (one cake), 90th percentile 120g (a
  // single ramen/cup). A 248g Maggi pack is four cakes, not one serving.
  { id: 'noodles', re: /\b(noodles?|noddles|ramen|ramyun|maggi|yippee|pasta|macaroni)\b/i, standard: 70, unit: 'g', singleServeMax: 140 },
  // Median real label serving 50g (two slices); a 150g bun pack is several.
  { id: 'bread', re: /\b(bread|buns?|pav|loaf|kulcha|naan|pita)\b/i, standard: 50, unit: 'g', singleServeMax: 60 },
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
  // Ready-to-eat pouches state HALF the pack as their serving -- checked
  // live: 250g -> 125, 285g -> 142, 300g -> 150, 240g -> 120 ("serves
  // 2"). Median real serving 125g; only small pouches (a 60g instant poha)
  // are one serving by themselves.
  'ready-meal': { standard: 125, unit: 'g', singleServeMax: 150 },
  beverage: { standard: 180, unit: 'ml', singleServeMax: 350 },
  dairy: { standard: 50, unit: 'g', singleServeMax: 200 },
  'nuts-seeds': { standard: 25, unit: 'g', singleServeMax: 50 },
  other: { standard: null, unit: 'g', singleServeMax: 60 },
};

// The largest amount still believably ONE serving, by food type --
// past this, a stated serving is treated as a pack weight in disguise.
// Snacks tightened from 100 after the live catalog: 90% of real namkeen
// label servings are 40g or less (median 25g), so a "90g serving" of sev
// bhujia is a pack weight in disguise. Sweet/baked keep a bit more room
// for a genuine single cake slice or brownie.
const MAX_PLAUSIBLE_SERVING = {
  'fried-snack': 60,
  'sweet-snack': 80,
  'baked-snack': 80,
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

// Spooned/dosed food types: the pack is never one serving.
const PACK_NEVER_A_SERVING_TYPES = new Set(['condiment', 'supplement', 'oil-fat']);

// Made up into several servings, or used by the spoonful, not eaten as
// packed (live: a 163g Knorr soup powder packet, which makes ~4 bowls,
// read as 11.4 tsp "per serving"). "mix" is whole-word only, so "mixed
// fruit juice"/"bhujia mixture" are unaffected. "condensed" -- condensed
// milk is ~55% sugar and spooned, never drunk by the glass.
const MADE_UP_PRODUCT_RE = /\b(soups?|premix|mix|mixers?|powder|concentrate|sharbat|squash|cordial|syrups?|condensed)\b/i;

// Tea/coffee sold as leaves, bags or granules, not a ready drink --
// brewed with water, and the pack weight is dry product (live: "Lipton
// Green Tea 250 g" read as a 180ml drink at 8.3 tsp). A ready-to-drink
// iced tea / cold coffee still counts.
// "infusion"/"tisane": herbal teas are sold as dry leaves too (live: a
// "Digestea Herbal Infusion" read as a 180ml drink with 54g of fat).
const DRY_TEA_COFFEE_RE = /\b(tea|coffee|chai|infusions?|tisanes?)\b/i;
const READY_TO_DRINK_RE = /\b(iced|ice tea|cold coffee|cold brew|ready to drink|frappe|latte|can|bottle)\b/i;

// Cooking ingredients / seasonings, not something eaten by the serving
// (live: a 200g frozen grated coconut read as one serving = 17 tsp of
// oil's fat; a 200ml fresh cream as 11 tsp; a 50g chilli-flakes jar as
// one serving).
const COOKING_INGREDIENT_RE = /\b(grated coconut|desiccated coconut|coconut milk|coconut cream|fresh cream|cooking cream|whipping cream|dairy cream|chil+i flakes|oregano|seasoning|spices?|spreads?)\b/i;

// Ayurvedic/herbal juices are taken as a small dose (typically 30ml,
// often diluted), not drunk by the glass -- live: a seabuckthorn "herbal
// juice" offered as a swap for a 250ml mango drink.
const DOSED_JUICE_RE = /\b(herbal|aloe vera|amla|karela|giloy|wheatgrass|noni|sea ?buckthorn|jamun|tulsi|neem)\b[\w\s]*\bjuice\b/i;

/**
 * True for a name that says the product isn't eaten the way it's packed
 * -- made up with water, brewed, or cooked with -- so its PACK is never
 * one serving (the label's own stated serving still can be: 30g of a
 * hot-chocolate mix is a real cup).
 */
export function isNotEatenAsPackedName(name) {
  const n = name || '';
  return MADE_UP_PRODUCT_RE.test(n)
    || (DRY_TEA_COFFEE_RE.test(n) && !READY_TO_DRINK_RE.test(n))
    || COOKING_INGREDIENT_RE.test(n)
    || DOSED_JUICE_RE.test(n);
}

function categoryFor(report) {
  const name = report.productName || '';
  const byName = CATEGORIES.find((c) => c.re.test(name) && (!c.drinkOnly || !report.foodType || DRINK_FOOD_TYPES.has(report.foodType)));
  if (byName) return byName;
  return BY_FOOD_TYPE[report.foodType] || BY_FOOD_TYPE.other;
}

/**
 * The specific kind of product by name ('biscuit', 'chocolate',
 * 'noodles', 'ice-cream'...), or null when the name matches none --
 * narrower than foodType, which lumps ice cream with curd as 'dairy'.
 */
export function productKind(report) {
  const c = CATEGORIES.find((cat) => cat.re.test(report?.productName || '') && (!cat.drinkOnly || !report.foodType || DRINK_FOOD_TYPES.has(report.foodType)));
  return c ? c.id : null;
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
 * @param {object} [opts]
 * @param {boolean} [opts.allowStandard=true] - false = REAL servings only
 *   (label or pack), never the category estimate. What gets SAVED on a
 *   report must be real -- only a display that labels it as an estimate
 *   may ask for the standard one.
 * @returns {null | { grams: number, unit: 'g'|'ml', source: 'label'|'pack'|'standard' }}
 */
export function resolveServing(report, { allowStandard = true } = {}) {
  if (!report) return null;
  const category = categoryFor(report);

  const labelGrams = report.realNutrientsServingGrams;
  // A 1-4g serving is junk on a snack, but real on a seasoning used a
  // pinch at a time (live: a chilli-flakes jar's 2g label serving).
  const isRealPinch = typeof labelGrams === 'number' && labelGrams > 0 && labelGrams < MIN_PLAUSIBLE_SERVING && isNotEatenAsPackedName(report.productName);
  if (isRealPinch || isPlausibleLabelServing(labelGrams, report.foodType)) {
    return { grams: labelGrams, unit: report.realNutrientsServingUnit || 'g', source: 'label' };
  }

  // A pack that's made up, brewed or cooked with is never one serving
  // (live: a 200g filter-coffee powder and a 200g badam-milk drink mix
  // both read as "one serving" and got a Quick Health Check).
  const pack = isNotEatenAsPackedName(report.productName) || PACK_NEVER_A_SERVING_TYPES.has(report.foodType) ? null : parsePackSize(report.packSize);
  if (pack && pack.value >= MIN_PLAUSIBLE_SERVING && pack.value <= category.singleServeMax) {
    return { grams: pack.value, unit: pack.unit, source: 'pack' };
  }

  if (allowStandard && category.standard) {
    return { grams: category.standard, unit: category.unit, source: 'standard' };
  }
  return null;
}
