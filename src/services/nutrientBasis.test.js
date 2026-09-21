import test from 'node:test';
import assert from 'node:assert/strict';
import { toPer100, toServing, panelToReportKeys, getNutrientsPer100 } from './nutrientBasis.js';

test('toPer100 scales a per-serving panel up to 100g', () => {
  assert.deepEqual(toPer100({ caloriesKcal: 80, sodiumMg: 100 }, 16), { caloriesKcal: 500, sodiumMg: 625 });
});

test('toPer100 without a serving size leaves values as-is', () => {
  assert.deepEqual(toPer100({ caloriesKcal: 454 }, null), { caloriesKcal: 454 });
});

test('toServing is the inverse of toPer100', () => {
  assert.deepEqual(toServing({ caloriesKcal: 500 }, 16), { caloriesKcal: 80 });
});

test('panelToReportKeys renames admin keys and drops non-numbers', () => {
  assert.deepEqual(panelToReportKeys({ energyKcal: 400, totalCarbG: 50, fiberG: 2, sodiumMg: '' }), {
    caloriesKcal: 400, carbohydrateG: 50, fibreG: 2,
  });
});

test('getNutrientsPer100 prefers the stored canonical field', () => {
  assert.deepEqual(
    getNutrientsPer100({ nutrientsPer100: { caloriesKcal: 500 }, realNutrients: { caloriesKcal: 80 }, realNutrientsServingGrams: 16 }),
    { caloriesKcal: 500 }
  );
});

test('getNutrientsPer100 derives from legacy realNutrients + serving', () => {
  assert.deepEqual(
    getNutrientsPer100({ realNutrients: { caloriesKcal: 80 }, realNutrientsServingGrams: 16 }),
    { caloriesKcal: 500 }
  );
});

test('getNutrientsPer100 lets a per-100 admin panel override the misread realNutrients', () => {
  const r = getNutrientsPer100({
    realNutrients: { sodiumMg: 600 }, realNutrientsServingGrams: 30,
    nutritionPanel: { sodiumMg: 600, energyKcal: 480 },
  });
  assert.equal(r.sodiumMg, 600);
  assert.equal(r.caloriesKcal, 480);
});

test('getNutrientsPer100 is null with no numbers', () => {
  assert.equal(getNutrientsPer100({}), null);
  assert.equal(getNutrientsPer100(null), null);
});
