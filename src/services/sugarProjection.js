// src/services/sugarProjection.js
//
// "If you have this every day, how much sugar does it add up to?" --
// pure arithmetic on the product's own label figures, nothing else.
// Deliberately NOT a prediction of what happens to anyone's body: one
// product's label can't know the rest of someone's diet, activity or
// health, so any "this causes X" framing would be inventing certainty
// the data doesn't have (and is exactly the unsubstantiated-harm-claim
// pattern a food brand sued another label app over). What IS knowable
// is plain quantity -- and research on sugar labelling found exactly
// that works best: teaspoons of sugar rated most effective and read as
// "factual and objective", where a vague "high in sugar" did not.
//
// No AI call, no network, never an estimate -- null whenever the real
// numbers needed aren't there, and nothing is shown.
import { getNutrientsPer100 } from './nutrientBasis.js';

// The standard conversion WHO/public-health sugar messaging uses.
export const GRAMS_PER_TEASPOON = 4;

// Under one teaspoon per serving, "every day" doesn't add up to
// anything worth a whole card -- same idea as dailyHabitCheck.js's own
// MIN_PERCENT_TO_SHOW bar.
const MIN_GRAMS_PER_SERVING = GRAMS_PER_TEASPOON;

// Higher bar when the label gives no added-vs-total split: that one
// figure then includes the food's own sugars too, and on a savory item
// a small amount is mostly just that (a real ready-to-eat biryani
// showed 5.6g -- onions and rice, not a sugar habit worth a card, and
// "a biryani adds up to 2kg of sugar a year" would mislead). Two
// teaspoons is where it's reliably a genuinely sweet product.
const MIN_GRAMS_PER_SERVING_NO_SPLIT = GRAMS_PER_TEASPOON * 2;

// Eaten a pinch/spoonful at a time, or not ordinary food at all --
// "a year of sugar from your ketchup" would be a statement about the
// 100g unit, not anyone's real habit.
const EXCLUDED_FOOD_TYPES = new Set(['condiment', 'supplement', 'infant', 'oil-fat']);

// Names that say the sugar in them is the food's own (fruit, milk)
// rather than added -- only matters when the label gives no separate
// added-sugar figure to tell the two apart (see below).
const NATURAL_SUGAR_NAME_RE = /(\b100\s*%|\bno added sugar|\bwithout added sugar|\bzero added sugar|\bunsweetened\b)/i;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {object} report - a saved product report.
 * @returns {null | {
 *   gramsPerServing: number, teaspoonsPerServing: number,
 *   isAddedSugar: boolean, servingGrams: number, servingUnit: string,
 * }}
 */
export function buildSugarProjection(report) {
  if (!report) return null;
  if (report.isCondimentOrSeasoning || report.isInfantFormula) return null;
  if (EXCLUDED_FOOD_TYPES.has(report.foodType)) return null;

  // A REAL serving size is required, not a fallback to per-100g --
  // nobody eats 100g of chips as "one", they eat a packet, and a daily
  // projection built on the wrong unit would be the exact
  // serving-basis mistake this app has already had to fix once.
  const servingGrams = report.realNutrientsServingGrams;
  if (typeof servingGrams !== 'number' || !Number.isFinite(servingGrams) || servingGrams <= 0) return null;

  // Exactly 100 is almost always the label's per-100g basis recorded AS
  // the serving, not a real serving -- checked against the live catalog:
  // an Oreo "serving" of 100g (9.7 tsp, vs ~3 biscuits in reality), a
  // 100g "serving" of Cadbury Dairy Milk (14 tsp), Bournvita (8 tsp, vs
  // a ~20g scoop). That's a 3-5x overstatement shown loudly. A few real
  // 100g cups (a yogurt, a mishti doi) lose the card too -- better to
  // quietly lose a signal than to show a wrong one.
  if (servingGrams === 100) return null;

  const per100 = getNutrientsPer100(report);
  if (!per100) return null;

  // How the pipeline stores sugar (openFoodFacts.js/blinkitProductsRepo.js):
  // addedSugarG is the label's added-sugar figure, falling back to its
  // TOTAL sugar when no added figure exists; totalSugarG is only stored
  // when it genuinely differs -- i.e. when the label actually split the
  // two. So totalSugarG present = addedSugarG really is added sugar.
  const hasSplit = typeof per100.totalSugarG === 'number';
  const sugarPer100 = per100.addedSugarG;
  if (typeof sugarPer100 !== 'number' || !Number.isFinite(sugarPer100) || sugarPer100 <= 0) return null;

  // Without that split, the one figure could be entirely natural sugar
  // (a glass of plain milk's own lactose, a 100% juice's own fruit
  // sugar) -- stacking that up as "spoons of sugar a year" would
  // mislead, so skip rather than guess.
  if (!hasSplit && (report.foodType === 'dairy' || NATURAL_SUGAR_NAME_RE.test(report.productName || ''))) return null;

  const gramsPerServing = round1((sugarPer100 * servingGrams) / 100);
  if (gramsPerServing < (hasSplit ? MIN_GRAMS_PER_SERVING : MIN_GRAMS_PER_SERVING_NO_SPLIT)) return null;

  return {
    gramsPerServing,
    teaspoonsPerServing: round1(gramsPerServing / GRAMS_PER_TEASPOON),
    isAddedSugar: hasSplit,
    servingGrams,
    servingUnit: report.realNutrientsServingUnit || 'g',
  };
}

/**
 * Total sugar over a week/month/year at a given frequency -- plain
 * multiplication, no rounding tricks. A "month" is 30 days, a "year" 52
 * weeks, both stated plainly in the UI.
 *
 * @param {number} gramsPerServing
 * @param {number} timesPerWeek - e.g. 7 (every day), 3, 1
 */
export function accumulateSugar(gramsPerServing, timesPerWeek) {
  const perWeek = gramsPerServing * timesPerWeek;
  const totals = {
    week: perWeek,
    month: (perWeek / 7) * 30,
    year: perWeek * 52,
  };
  const out = {};
  for (const [period, grams] of Object.entries(totals)) {
    out[period] = {
      grams: Math.round(grams),
      teaspoons: Math.round(grams / GRAMS_PER_TEASPOON),
      kg: round1(grams / 1000),
    };
  }
  return out;
}
