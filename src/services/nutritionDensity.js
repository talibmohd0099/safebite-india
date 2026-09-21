// src/services/nutritionDensity.js
//
// The ingredient score answers "how clean is the ingredient list"; it says
// nothing about how dense the food is in calories, fat, sugar and salt --
// which is how a deep-fried namkeen made of gram flour, oil and salt
// earned 89-96/100. This adds the missing dimension using a Nutri-Score
// style points system on the canonical per-100 g/ml figures (see
// nutrientBasis.js), and turns it into a CEILING on fried / energy-dense
// snacks. It only ever lowers a score.

import { getNutrientsPer100 } from './nutrientBasis.js';
import { verdictFor } from './scoringEngine.js';

// Fried and energy-dense snacks land in the "Moderate" band at best:
// [DENSE_SNACK_FLOOR, DENSE_SNACK_CEILING]. The ceiling is the product
// owner's chosen maximum (63); the floor stops one dense-but-otherwise-
// clean snack from being flattened onto the harmful-ingredient range.
export const DENSE_SNACK_CEILING = 63;
export const DENSE_SNACK_FLOOR = 45;
// A fried snack with no nutrition panel at all can't be positioned inside
// the band from data, so it gets a flat, cautious value instead.
export const NO_DATA_SNACK_CEILING = 58;

// Food types the ceiling never applies to: they're eaten in a different
// way (or judged by a different standard) than a packaged snack, so
// per-100 g energy/fat density would be the wrong yardstick. Nuts, seeds,
// oils, ghee and butter are dense BY NATURE; staples/dairy/beverages have
// their own logic; supplements and infant formula are purpose-built.
const EXEMPT_TYPES = new Set([
  'nuts-seeds', 'oil-fat', 'staple', 'dairy', 'beverage', 'supplement', 'infant', 'condiment',
]);

// Nutri-Score negative components: each threshold step is one point, to a
// maximum of 10. Steps are the published ones (energy 335 kJ ~ 80 kcal,
// sugars 4.5 g, saturated fat 1 g, sodium 90 mg); positives (protein,
// fibre) max at 5 each.
const points = (value, step, max) => Math.min(max, Math.max(0, Math.floor((value ?? 0) / step)));

/**
 * @returns {number|null} 0-100 (higher = better nutritional profile), or
 *   null when there aren't enough real numbers to say anything.
 */
export function nutritionDensityScore(per100) {
  if (!per100 || typeof per100.caloriesKcal !== 'number') return null;
  const sugar = typeof per100.addedSugarG === 'number' ? per100.addedSugarG : per100.totalSugarG;
  const negative =
    points(per100.caloriesKcal, 80, 10) +
    points(sugar, 4.5, 10) +
    points(per100.saturatedFatG, 1, 10) +
    points(per100.sodiumMg, 90, 10);
  const positive = points(per100.proteinG, 1.6, 5) + points(per100.fibreG, 0.9, 5);
  // Nutri-Score's A-E spread is -15..40; map onto 0-100.
  const raw = negative - positive;
  return Math.max(0, Math.min(100, Math.round(100 - ((raw + 15) * 100) / 55)));
}

/** Energy-dense enough to count as a "dense snack" even when not known to be fried. */
function isEnergyDenseSnack(per100, foodType) {
  return foodType === 'sweet-snack' && per100 && per100.caloriesKcal >= 400;
}

/**
 * Lowers report.overallScore into the dense-snack band when the product is
 * a fried or energy-dense snack. Never raises a score. Sets
 * report.nutritionDensity / report.scoreNote for transparency.
 *
 * @returns {object} the same report (mutated)
 */
export function applyNutritionDensityCeiling(report) {
  const foodType = report.foodType;
  if (!foodType || EXEMPT_TYPES.has(foodType) || report.isInfantFormula || report.isCondimentOrSeasoning) return report;

  const per100 = getNutrientsPer100(report);
  const fried = report.isDeepFried === true || foodType === 'fried-snack';
  const density = nutritionDensityScore(per100);
  if (typeof density === 'number') report.nutritionDensity = density;

  let ceiling = null;
  if (fried) {
    ceiling = density === null
      ? NO_DATA_SNACK_CEILING
      : DENSE_SNACK_FLOOR + Math.round((density / 100) * (DENSE_SNACK_CEILING - DENSE_SNACK_FLOOR));
    if (density === null) report.scoreNote = 'ingredients-only';
  } else if (isEnergyDenseSnack(per100, foodType) && density !== null && density < 60) {
    ceiling = DENSE_SNACK_FLOOR + Math.round((density / 100) * (DENSE_SNACK_CEILING - DENSE_SNACK_FLOOR));
  }

  if (ceiling !== null && report.overallScore > ceiling) {
    report.overallScoreBeforeDensity = report.overallScore;
    report.overallScore = ceiling;
    report.verdict = verdictFor(ceiling);
  }
  return report;
}
