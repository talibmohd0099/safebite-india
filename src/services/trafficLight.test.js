import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrafficLight, levelFor } from './trafficLight.js';

test('UK FSA food levels per 100g', () => {
  const r = buildTrafficLight({ foodType: 'fried-snack', nutrientsPer100: { totalFatG: 35, saturatedFatG: 3, addedSugarG: 2, sodiumMg: 700 } });
  assert.deepEqual(r.items.map((i) => [i.key, i.level]), [['fat', 'high'], ['satFat', 'medium'], ['sugars', 'low'], ['salt', 'high']]);
  assert.equal(r.items.find((i) => i.key === 'salt').grams, 1.8); // 700mg x 2.5
});

test('drinks use the per-100ml levels', () => {
  const r = buildTrafficLight({ foodType: 'beverage', nutrientsPer100: { addedSugarG: 10.6, totalFatG: 0 } });
  assert.equal(r.isDrink, true);
  assert.equal(r.items.find((i) => i.key === 'sugars').level, 'medium'); // 10.6 <= 11.25
  assert.equal(buildTrafficLight({ foodType: 'beverage', nutrientsPer100: { addedSugarG: 12, totalFatG: 0 } }).items[1].level, 'high');
});

test('total sugars, not added, when the label splits them', () => {
  const r = buildTrafficLight({ foodType: 'dairy', nutrientsPer100: { addedSugarG: 4, totalSugarG: 12, totalFatG: 3 } });
  assert.equal(r.items.find((i) => i.key === 'sugars').grams, 12);
});

test('boundaries: low is inclusive, high is strictly above', () => {
  assert.equal(levelFor(5, [5, 22.5]), 'low');
  assert.equal(levelFor(22.5, [5, 22.5]), 'medium');
  assert.equal(levelFor(22.6, [5, 22.5]), 'high');
});

test('needs at least two known values; skips infant formula and data errors', () => {
  assert.equal(buildTrafficLight({ nutrientsPer100: { totalFatG: 10 } }), null);
  assert.equal(buildTrafficLight({ isInfantFormula: true, nutrientsPer100: { totalFatG: 10, addedSugarG: 5 } }), null);
  assert.equal(buildTrafficLight({ nutrientsPer100: { totalFatG: 140, addedSugarG: 5 } }), null);
});
