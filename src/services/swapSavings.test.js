import test from 'node:test';
import assert from 'node:assert/strict';
import { swapSavings } from './swapSavings.js';

test('lists what the alternative has less of, per 100g, biggest first', () => {
  const current = { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 30, sodiumMg: 400, saturatedFatG: 12 } };
  const alt = { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 18, sodiumMg: 200, saturatedFatG: 11.5 } };
  const s = swapSavings(current, alt);
  assert.deepEqual(s.map((x) => x.key), ['sugar', 'salt']); // sat fat 0.5g < 1g bar
  assert.deepEqual(s[0], { key: 'sugar', grams: 12, teaspoons: 3 });
  assert.equal(s[1].grams, 0.5); // (400-200)mg x 2.5
});

test('compares total sugars on both sides', () => {
  const current = { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 5, totalSugarG: 20 } };
  const alt = { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 10 } }; // 10 is its total
  assert.equal(swapSavings(current, alt)[0].grams, 10);
});

test('nothing when the alternative is not lower, or data is missing/impossible', () => {
  assert.deepEqual(swapSavings({ productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 5 } }, { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 9 } }), []);
  assert.deepEqual(swapSavings({ productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 30 } }, {}), []);
  assert.deepEqual(swapSavings({ productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 300 } }, { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 5 } }), []);
});

test('falls back to per-serving figures converted to per 100', () => {
  const current = { productName: 'Some Cookies', foodType: 'sweet-snack', realNutrients: { addedSugarG: 6 }, realNutrientsServingGrams: 20 }; // 30g/100g
  const alt = { productName: 'Some Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 10 } };
  assert.equal(swapSavings(current, alt)[0].grams, 20);
});

test('never compares different kinds of product (live cases)', () => {
  const fanta = { productName: 'Fanta Orange Soft Drink', foodType: 'beverage', nutrientsPer100: { addedSugarG: 13.7 } };
  const tea = { productName: 'Naturified Healthy Hair Herbal Tea', foodType: 'beverage', nutrientsPer100: { addedSugarG: 0 } };
  assert.deepEqual(swapSavings(fanta, tea), []); // dry leaves, not a drink
  const noodles = { productName: 'RUM-PUM Veg Noodles', foodType: 'ready-meal', nutrientsPer100: { sodiumMg: 2400 } };
  const sauce = { productName: 'Napuor Pizza & Pasta Sauce', foodType: 'condiment', nutrientsPer100: { sodiumMg: 100 } };
  assert.deepEqual(swapSavings(noodles, sauce), []);
  assert.deepEqual(swapSavings(noodles, { ...noodles, foodType: undefined }), []);
});

test('same foodType is not enough -- the specific kind must match', () => {
  const cone = { productName: 'Mother Dairy Choconado Ice Cream Cone', foodType: 'dairy', nutrientsPer100: { addedSugarG: 30, saturatedFatG: 12 } };
  const curd = { productName: 'Sids Farm Buffalo Cup Curd', foodType: 'dairy', nutrientsPer100: { addedSugarG: 3, saturatedFatG: 1 } };
  assert.deepEqual(swapSavings(cone, curd), []);
  const oreo = { productName: 'Oreo Mini Cream Biscuits', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 38 } };
  const biscotti = { productName: 'Almond Biscotti Cookies', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 8 } };
  assert.equal(swapSavings(oreo, biscotti)[0].key, 'sugar');
});

test('more live mismatches that must not become swaps', () => {
  const bar = { productName: 'Cadbury Temptations Rum & Raisin Chocolate Bar', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 55 } };
  assert.deepEqual(swapSavings(bar, { productName: 'Meve Jars Monkfruit Dark Chocolate Spread', foodType: 'sweet-snack', nutrientsPer100: { addedSugarG: 3 } }), []);
  const dm = { productName: 'Dairy Milk', foodType: 'dairy', nutrientsPer100: { addedSugarG: 57 } };
  assert.deepEqual(swapSavings(dm, { productName: 'Mother Dairy Milk', foodType: 'dairy', nutrientsPer100: { addedSugarG: 5 } }), []);
  const bites = { productName: 'Athawale Cheese Pepper Bites', foodType: 'dairy', nutrientsPer100: { saturatedFatG: 15 } };
  assert.deepEqual(swapSavings(bites, { productName: 'Marinated A2 Low Fat Paneer', foodType: 'dairy', nutrientsPer100: { saturatedFatG: 2 } }), []);
  const maaza = { productName: 'Maaza Refresh Mango Drink', foodType: 'beverage', nutrientsPer100: { addedSugarG: 14 } };
  assert.deepEqual(swapSavings(maaza, { productName: 'Manohar Naturals Seabuckthorn Herbal Juice', foodType: 'beverage', nutrientsPer100: { addedSugarG: 3 } }), []);
});
