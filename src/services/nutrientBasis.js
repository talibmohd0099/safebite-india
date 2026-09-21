// src/services/nutrientBasis.js
// One canonical basis for nutrition numbers: PER 100 g/ml.
//
// Reports used to store numbers on three different bases depending on
// where they came from -- Open Food Facts scaled to the pack/serving,
// Blinkit left per-100, and the admin form typed per-100 but treated it as
// already scaled -- so "is this 30g of sodium or 100g?" had no answer and
// scores compared apples with oranges (a 16g-serving cookie panel read as
// if it were 100g). Everything now stores `nutrientsPer100` and derives a
// per-serving view from it on demand.

const round2 = (n) => Math.round(n * 100) / 100;

/** Multiply every numeric field by `factor`, rounded to 2 dp. */
function scaleAll(nutrients, factor) {
  if (!nutrients) return null;
  const out = {};
  for (const [key, value] of Object.entries(nutrients)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = round2(value * factor);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Per-serving figures -> per-100. Without a serving size the input already IS per-100. */
export function toPer100(nutrients, servingGrams) {
  if (!servingGrams || servingGrams <= 0) return scaleAll(nutrients, 1);
  return scaleAll(nutrients, 100 / servingGrams);
}

/** Per-100 figures -> per `servingGrams`. Without a serving size returns the per-100 values. */
export function toServing(per100, servingGrams) {
  if (!servingGrams || servingGrams <= 0) return scaleAll(per100, 1);
  return scaleAll(per100, servingGrams / 100);
}

// The admin form's own key names -> the report's (Open Food Facts style).
const ADMIN_TO_REPORT_KEY = {
  sodiumMg: 'sodiumMg',
  addedSugarG: 'addedSugarG',
  totalSugarG: 'totalSugarG',
  saturatedFatG: 'saturatedFatG',
  transFatG: 'transFatG',
  energyKcal: 'caloriesKcal',
  proteinG: 'proteinG',
  totalCarbG: 'carbohydrateG',
  totalFatG: 'totalFatG',
  fiberG: 'fibreG',
};

/** A `nutritionPanel` (admin key names, per 100) -> report key names. */
export function panelToReportKeys(panel) {
  if (!panel) return null;
  const out = {};
  for (const [adminKey, reportKey] of Object.entries(ADMIN_TO_REPORT_KEY)) {
    const v = panel[adminKey];
    if (typeof v === 'number' && Number.isFinite(v)) out[reportKey] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The per-100 figures for any report, old or new.
 * Order of trust: stored `nutrientsPer100` > admin `nutritionPanel`
 * (always typed per-100) > `realNutrients` divided back down by the
 * serving it was scaled to (null serving = it was per-100 already).
 * Returns null when the report carries no real numbers.
 */
export function getNutrientsPer100(report) {
  if (!report) return null;
  if (report.nutrientsPer100 && Object.keys(report.nutrientsPer100).length > 0) return report.nutrientsPer100;
  const derived = report.realNutrients
    ? toPer100(report.realNutrients, report.realNutrientsServingGrams)
    : null;
  const fromPanel = panelToReportKeys(report.nutritionPanel);
  if (fromPanel) return { ...(derived || {}), ...fromPanel };
  return derived;
}
