// src/services/dailyHabitCheck.js
//
// "If this became a daily habit..." -- a purely rule-based projection
// (no AI call, just arithmetic against WHO's published daily limits),
// so it never costs anything extra in Gemini/translation quota, and its
// numbers are never invented -- if a product's real nutrition-panel
// data isn't known, this returns null and nothing is shown.
//
// Deliberately skipped for condiments/seasonings (masalas, spice
// blends, etc.) -- see the isCondimentOrSeasoning check at the call
// site in analyzeText.js. Those are eaten a pinch at a time, so framing
// them at a "how much of this do you eat a day" scale would mislead
// rather than inform.

// WHO's published daily limits for an adult on a 2000-kcal reference
// diet -- the same reference basis Indian nutrition labels already use
// for %RDA figures. https://www.who.int/news-room/fact-sheets/detail/sodium
// and https://www.who.int/news-room/fact-sheets/detail/sugars-intake
// and https://www.who.int/news-room/fact-sheets/detail/fats-and-fatty-acids
export const NUTRIENT_LIMITS = [
  { key: 'sodiumMg', unit: 'mg', limit: 2000, label: 'sodium' },
  { key: 'addedSugarG', unit: 'g', limit: 50, label: 'added sugar' },
  { key: 'saturatedFatG', unit: 'g', limit: 22, label: 'saturated fat' },
  { key: 'transFatG', unit: 'g', limit: 2, label: 'trans fat' },
];

// Below this, the "every day" framing isn't dramatic (or honest) enough
// to be worth showing -- using 10-20% of a daily limit from one product
// isn't a meaningful daily-habit risk on its own.
const MIN_PERCENT_TO_SHOW = 30;

// Foods measured out in spoonfuls, not servings. Every number this file
// works with is per 100g (or per pack), so "68% of your daily saturated
// fat" is a fair thing to say about a chocolate bar and a nonsense thing
// to say about cooking oil -- nobody eats 100g of mustard oil, and
// butter at 218% of a day's saturated fat per 100g is a statement about
// the unit, not about anyone's actual butter habit.
//
// This is the same judgment the isCondimentOrSeasoning check already
// makes at the call site in analyzeText.js -- but that one is set by
// Gemini per product and is simply absent on the hundreds of rows whose
// reports predate it (a real chaat masala among them, caught scoring
// 94 -> 61 on a sodium reading nobody would ever eat in one sitting).
// A deterministic name check costs nothing and can't silently go
// missing.
const SMALL_PORTION_RE =
  /\b(oils?|ghee|butter|papads?|pappads?|pickles?|achar|vinegar|salt|baking powder|yeast|essence|masala|spice mix|seasoning)\b/i;

// ...unless the name also says it's an ordinary food that merely
// CONTAINS or is FLAVOURED with one of those. "Masala oats" is a
// breakfast bowl, "masala noodles" is a meal, "butter biscuit" is a
// biscuit -- all eaten in real portions, all correctly subject to the
// daily-limit framing.
const ORDINARY_PORTION_RE =
  /\b(oats?|noodles?|pasta|vermicelli|biscuits?|cookies?|chips|crisps|namkeen|bhujia|chakli|cakes?|crackers?|snacks?|mixture|popcorn|sev|wafers?|bars?|drinks?|juice|shake|granola|cereal|bread)\b/i;

/**
 * True for a product whose nutrition numbers shouldn't be read against
 * a full day's limit at all, because nobody consumes it by the 100g.
 * Used to skip both the "daily habit" projection and the score cap that
 * reads it (see applyRealNutrientCap in scoringEngine.js).
 */
export function isSmallPortionFood(productName) {
  const name = productName || '';
  if (ORDINARY_PORTION_RE.test(name)) return false;
  return SMALL_PORTION_RE.test(name);
}

/**
 * @param {object} nutrients - real, already-known amounts scaled to
 *   whatever `servingGrams` describes (never estimated): { sodiumMg,
 *   addedSugarG, saturatedFatG, transFatG }. Any field can be omitted if
 *   genuinely unknown for this product.
 * @param {number|null} servingGrams - the real pack weight in grams
 *   when known, or null when it isn't (in which case `nutrients` should
 *   already be the standard per-100g figures -- the one basis FSSAI
 *   mandates every Indian label state, so it's always a safe, honest
 *   fallback reference even without knowing the actual pack size).
 *   Returned as-is so the UI can phrase "a 70g pack" vs "every 100g" in
 *   whichever language it's displaying, rather than baking English
 *   grammar into this rule-based layer.
 * @returns the single most-over-limit nutrient's projection, or null if
 *   nothing is known or nothing clears the "worth mentioning" bar.
 */
export function buildDailyHabitCheck(nutrients, servingGrams = null) {
  if (!nutrients) return null;

  const candidates = NUTRIENT_LIMITS
    .map(({ key, unit, limit, label }) => {
      const amount = nutrients[key];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
      return { nutrientKey: key, nutrientLabel: label, unit, limit, amount, percent: (amount / limit) * 100 };
    })
    .filter(Boolean)
    .sort((a, b) => b.percent - a.percent);

  const top = candidates[0];
  if (!top || top.percent < MIN_PERCENT_TO_SHOW) return null;

  return {
    nutrientKey: top.nutrientKey,
    nutrientLabel: top.nutrientLabel,
    amount: Math.round(top.amount * 10) / 10,
    limit: top.limit,
    unit: top.unit,
    percent: Math.round(top.percent),
    servingGrams,
  };
}
