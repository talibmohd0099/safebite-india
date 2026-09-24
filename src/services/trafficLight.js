// src/services/trafficLight.js
//
// Front-of-pack "traffic light" levels for fat, saturated fat, sugars and
// salt -- the UK Food Standards Agency / Department of Health scheme
// (2016 guidance), the most widely used and tested one. India has no
// official equivalent yet, so this is labelled as the UK levels in the UI.
// Always per 100g (per 100ml for drinks): the scheme's thresholds are
// defined on that basis, so it can never depend on a serving estimate.
// Pure, no network.
import { getNutrientsPer100 } from './nutrientBasis.js';

// [low at or below, high above] per 100g / per 100ml.
const FOOD = { fat: [3, 17.5], satFat: [1.5, 5], sugars: [5, 22.5], salt: [0.3, 1.5] };
const DRINK = { fat: [1.5, 8.75], satFat: [0.75, 2.5], sugars: [2.5, 11.25], salt: [0.3, 0.75] };

const round1 = (n) => Math.round(n * 10) / 10;
const known = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function levelFor(value, [low, high]) {
  if (value <= low) return 'low';
  if (value > high) return 'high';
  return 'medium';
}

/**
 * @returns {null | { isDrink: boolean, items: Array<{ key: 'fat'|'satFat'|'sugars'|'salt', grams: number, level: 'low'|'medium'|'high' }> }}
 *   null when fewer than two of the four are known (a single light isn't a traffic light).
 */
export function buildTrafficLight(report) {
  if (!report || report.isInfantFormula) return null;
  const per100 = getNutrientsPer100(report);
  if (!per100) return null;
  const isDrink = report.foodType === 'beverage' || report.realNutrientsServingUnit === 'ml';
  const limits = isDrink ? DRINK : FOOD;

  // Stored convention (see sugarProjection.js): totalSugarG only exists
  // when it differs from addedSugarG, which otherwise holds the total.
  // The scheme is about TOTAL sugars.
  const sugars = known(per100.totalSugarG) ? per100.totalSugarG : per100.addedSugarG;
  const values = {
    fat: per100.totalFatG,
    satFat: per100.saturatedFatG,
    sugars,
    // Past 100g per 100g is a data error, not a food.
    salt: known(per100.sodiumMg) ? (per100.sodiumMg * 2.5) / 1000 : undefined,
  };

  const items = Object.entries(values)
    .filter(([, v]) => known(v) && v <= 100)
    .map(([key, v]) => ({ key, grams: round1(v), level: levelFor(v, limits[key]) }));
  if (items.length < 2) return null;
  return { isDrink, items };
}
