import test from 'node:test';
import assert from 'node:assert/strict';
import { nutritionDensityScore, applyNutritionDensityCeiling, DENSE_SNACK_CEILING, DENSE_SNACK_FLOOR, NO_DATA_SNACK_CEILING } from './nutritionDensity.js';

const snack = (over = {}) => ({
  productName: 'X', overallScore: 90, verdict: 'Excellent', foodType: 'fried-snack', isDeepFried: true,
  nutrientsPer100: { caloriesKcal: 550, saturatedFatG: 8, addedSugarG: 2, sodiumMg: 700, proteinG: 8, fibreG: 3 },
  ...over,
});

test('density score: a fried namkeen profile is mediocre, plain dal is strong', () => {
  const namkeen = nutritionDensityScore({ caloriesKcal: 550, saturatedFatG: 8, addedSugarG: 2, sodiumMg: 700, proteinG: 8, fibreG: 3 });
  const dal = nutritionDensityScore({ caloriesKcal: 340, saturatedFatG: 0.5, addedSugarG: 1, sodiumMg: 20, proteinG: 22, fibreG: 12 });
  assert.ok(namkeen < 60, `namkeen ${namkeen}`);
  assert.ok(dal > 75, `dal ${dal}`);
});

test('density score is null without calories', () => {
  assert.equal(nutritionDensityScore({ sodiumMg: 10 }), null);
  assert.equal(nutritionDensityScore(null), null);
});

test('a fried snack scoring 89 is pulled into the 45-63 band, never above 63', () => {
  const r = applyNutritionDensityCeiling(snack({ overallScore: 89, verdict: 'Excellent' }));
  assert.ok(r.overallScore <= DENSE_SNACK_CEILING);
  assert.ok(r.overallScore >= DENSE_SNACK_FLOOR);
  assert.equal(r.verdict, 'Moderate');
  assert.equal(r.overallScoreBeforeDensity, 89);
});

test('the ceiling never raises a score', () => {
  const r = applyNutritionDensityCeiling(snack({ overallScore: 30, verdict: 'Poor' }));
  assert.equal(r.overallScore, 30);
});

test('a fried snack with no nutrition data gets the flat cautious cap and an ingredients-only note', () => {
  const r = applyNutritionDensityCeiling(snack({ nutrientsPer100: undefined, overallScore: 89 }));
  assert.equal(r.overallScore, NO_DATA_SNACK_CEILING);
  assert.equal(r.scoreNote, 'ingredients-only');
});

test('a fried snack with worse nutrition scores lower inside the band than a leaner one', () => {
  const lean = applyNutritionDensityCeiling(snack({ nutrientsPer100: { caloriesKcal: 420, saturatedFatG: 3, addedSugarG: 1, sodiumMg: 300, proteinG: 12, fibreG: 8 } }));
  const heavy = applyNutritionDensityCeiling(snack({ nutrientsPer100: { caloriesKcal: 570, saturatedFatG: 16, addedSugarG: 6, sodiumMg: 500, proteinG: 4, fibreG: 2 } }));
  assert.ok(lean.overallScore > heavy.overallScore, `${lean.overallScore} vs ${heavy.overallScore}`);
});

test('exempt types are untouched: nuts, oils, staples, supplements, infant formula', () => {
  for (const foodType of ['nuts-seeds', 'oil-fat', 'staple', 'supplement', 'infant', 'beverage', 'dairy']) {
    const r = applyNutritionDensityCeiling(snack({ foodType, isDeepFried: false, overallScore: 90 }));
    assert.equal(r.overallScore, 90, foodType);
  }
});

test('a report with no foodType is untouched', () => {
  const r = applyNutritionDensityCeiling(snack({ foodType: undefined, isDeepFried: false }));
  assert.equal(r.overallScore, 90);
});

test('an energy-dense sweet snack (cookie) is capped; a lean one is not', () => {
  const cookie = applyNutritionDensityCeiling({
    overallScore: 80, foodType: 'sweet-snack',
    nutrientsPer100: { caloriesKcal: 490, saturatedFatG: 8, addedSugarG: 25, sodiumMg: 400, proteinG: 6, fibreG: 1 },
  });
  assert.ok(cookie.overallScore <= DENSE_SNACK_CEILING);
  const light = applyNutritionDensityCeiling({
    overallScore: 80, foodType: 'sweet-snack',
    nutrientsPer100: { caloriesKcal: 300, saturatedFatG: 1, addedSugarG: 2, sodiumMg: 100, proteinG: 9, fibreG: 10 },
  });
  assert.equal(light.overallScore, 80);
});
