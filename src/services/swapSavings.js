// src/services/swapSavings.js
//
// "Swap to this instead and you'd get ..." -- how much less sugar, salt
// and saturated fat an alternative has than the product being viewed.
// Always per 100g (per 100ml for drinks): two products' servings differ,
// so per-serving would compare different amounts of food; per 100 is the
// one basis every Indian label must state. Pure arithmetic on both
// labels' own figures, no AI, nothing estimated.
import { getNutrientsPer100 } from './nutrientBasis.js';
import { isNotEatenAsPacked } from './sugarProjection.js';
import { productKind } from './servingResolver.js';

// Below these per-100 differences a "saving" is label rounding noise,
// not a reason to switch: half a teaspoon of sugar, a tenth of a
// teaspoon of salt, 1g of saturated fat.
const MIN_DIFF = { sugar: 2, salt: 0.25, satFat: 1 };
const GRAMS_PER_TSP = { sugar: 4, salt: 5 };

const round1 = (n) => Math.round(n * 10) / 10;
const num = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null);

function comparable(report) {
  const p = getNutrientsPer100(report);
  if (!p) return null;
  // The stored convention (see sugarProjection.js): addedSugarG holds the
  // total when no split exists; totalSugarG only when it differs. Compare
  // like with like -- total sugars on both sides.
  const sugar = num(p.totalSugarG) ?? num(p.addedSugarG);
  const sodium = typeof p.sodiumMg === 'number' && p.sodiumMg >= 0 && p.sodiumMg <= 40000 ? p.sodiumMg : null;
  return { sugar, salt: sodium == null ? null : (sodium * 2.5) / 1000, satFat: num(p.saturatedFatG) };
}

/**
 * @returns {Array<{ key: 'sugar'|'salt'|'satFat', grams: number, teaspoons: number|null }>}
 *   what the alternative has LESS of, per 100g, biggest share first;
 *   empty when it's not meaningfully lower in anything (or data is missing).
 */
export function swapSavings(current, alternative) {
  // Like for like only. The category match that finds alternatives is
  // by name keyword, so it can pair noodles with a pasta SAUCE, or a
  // soft drink with dry herbal-tea LEAVES (live: "3.4 tsp less sugar per
  // 100ml" -- per 100g of leaves, a false comparison). Same food type,
  // and neither one spooned/brewed/made up rather than eaten as packed.
  // foodType alone is too broad (live: an ice-cream cone vs a cup curd,
  // both 'dairy'; dark chocolate vs amla candy, both 'sweet-snack'), so
  // the specific kind by name must match too.
  if (!current || !alternative || !current.foodType || current.foodType !== alternative.foodType) return [];
  const kind = productKind(current);
  if (!kind || kind !== productKind(alternative)) return [];
  if (isNotEatenAsPacked(current) || isNotEatenAsPacked(alternative)) return [];
  const a = comparable(current);
  const b = comparable(alternative);
  if (!a || !b) return [];
  const out = [];
  for (const key of ['sugar', 'salt', 'satFat']) {
    if (a[key] == null || b[key] == null) continue;
    const diff = a[key] - b[key];
    if (diff < MIN_DIFF[key]) continue;
    out.push({
      key,
      grams: round1(diff),
      teaspoons: GRAMS_PER_TSP[key] ? round1(diff / GRAMS_PER_TSP[key]) : null,
      share: diff / MIN_DIFF[key],
    });
  }
  return out.sort((x, y) => y.share - x.share).map(({ share, ...rest }) => rest);
}
