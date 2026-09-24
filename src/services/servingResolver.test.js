import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveServing, parsePackSize, isPlausibleLabelServing } from './servingResolver.js';

test('a believable label serving wins, with its own unit', () => {
  const s = resolveServing({ productName: 'Frooti', foodType: 'beverage', realNutrientsServingGrams: 200, realNutrientsServingUnit: 'ml' });
  assert.deepEqual(s, { grams: 200, unit: 'ml', source: 'label' });
});

test('label servings that are not real are rejected', () => {
  assert.equal(isPlausibleLabelServing(100, 'sweet-snack'), false, 'exactly 100 = the per-100 basis');
  assert.equal(isPlausibleLabelServing(1, 'beverage'), false, '"1 g" junk (97 real Blinkit rows)');
  assert.equal(isPlausibleLabelServing(400, 'sweet-snack'), false, 'a family pack weight');
  assert.equal(isPlausibleLabelServing(305, 'ready-meal'), true, 'a single ready-meal pack');
  assert.equal(isPlausibleLabelServing(30, 'fried-snack'), true);
});

test('point 2: a small pack is one serving -- a label fact, not a guess', () => {
  const kitkat = resolveServing({ productName: 'Nestle KitKat', foodType: 'sweet-snack', packSize: '37.3 g' });
  assert.deepEqual(kitkat, { grams: 37.3, unit: 'g', source: 'pack' });
  const tetra = resolveServing({ productName: 'Real Mango Juice', foodType: 'beverage', packSize: '200 ml' });
  assert.deepEqual(tetra, { grams: 200, unit: 'ml', source: 'pack' });
});

test('a big pack is NOT one serving -- falls through to the typical serving', () => {
  const s = resolveServing({ productName: 'Parle-G Gold Biscuits', foodType: 'sweet-snack', packSize: '1 kg' });
  assert.deepEqual(s, { grams: 20, unit: 'g', source: 'standard' });
  const bottle = resolveServing({ productName: 'Coca Cola Soft Drink', foodType: 'beverage', packSize: '2.25 L' });
  assert.deepEqual(bottle, { grams: 180, unit: 'ml', source: 'standard' });
});

test('point 3: typical serving by category, name first', () => {
  assert.equal(resolveServing({ productName: 'Cadbury Dairy Milk', foodType: 'sweet-snack' }).grams, 30);
  assert.equal(resolveServing({ productName: 'Britannia Milk Bikis', foodType: 'sweet-snack' }).grams, 20, 'biscuit, not milk drink');
  assert.equal(resolveServing({ productName: 'Amul Kool Kesar Milk', foodType: 'dairy' }).unit, 'ml');
  assert.equal(resolveServing({ productName: 'Kwality Walls Cornetto Ice Cream Cone', foodType: 'dairy' }).grams, 65);
  assert.equal(resolveServing({ productName: 'Kelloggs Corn Flakes', foodType: 'staple' }).grams, 40);
});

test('falls back to the food type when the name matches no category', () => {
  const s = resolveServing({ productName: 'Haldiram Soan Papdi', foodType: 'sweet-snack' });
  assert.deepEqual(s, { grams: 20, unit: 'g', source: 'standard' });
});

test('an uncategorisable product gets NO invented serving', () => {
  assert.equal(resolveServing({ productName: 'Some Creme Sandwiches', foodType: 'other' }), null);
  assert.equal(resolveServing({ productName: 'Mystery Item' }), null);
});

test('parsePackSize reads the per-unit size and converts kg/L', () => {
  assert.deepEqual(parsePackSize('6 x 30 g'), { value: 30, unit: 'g' });
  assert.deepEqual(parsePackSize('1 kg'), { value: 1000, unit: 'g' });
  assert.deepEqual(parsePackSize('2.25 Ltr'), { value: 2250, unit: 'ml' });
  assert.deepEqual(parsePackSize('200 ml'), { value: 200, unit: 'ml' });
  assert.equal(parsePackSize('Pack'), null);
});

test('a pack that is made up, brewed or cooked with is never one serving (live cases)', () => {
  const cases = [
    { productName: 'Cothas Premium Special Filter Coffee (80% coffee, 20% chicory)', foodType: 'beverage', packSize: '200 g' },
    { productName: 'Organic Mandya Millet Badam Milk Drink Mix', foodType: 'beverage', packSize: '200 g' },
    { productName: "Jimmy's Bloody Mary Cocktail Mix", foodType: 'beverage', packSize: '250 ml' },
    { productName: 'Carpe Victus Crushed Chilli Flakes', foodType: 'other', packSize: '50 g' },
  ];
  for (const r of cases) assert.equal(resolveServing(r, { allowStandard: false }), null, r.productName);
  // ...but the label's own stated serving still counts (30g = one cup)
  assert.equal(resolveServing({ productName: 'Darkins Dark Hot Chocolate Mix', foodType: 'beverage', realNutrientsServingGrams: 30 }).source, 'label');
  // and a ready-to-drink iced tea can is still one serving
  assert.equal(resolveServing({ productName: 'Himalayan Brew Kangra Iced Tea', foodType: 'beverage', packSize: '330 ml' }).grams, 330);
  // a seasoning's own tiny serving is real, not junk
  assert.equal(resolveServing({ productName: 'Carpe Victus Crushed Chilli Flakes', realNutrientsServingGrams: 2 }).grams, 2);
  // corn flakes are still cereal
  assert.equal(resolveServing({ productName: "Kellogg's Corn Flakes", foodType: 'staple' }).grams, 40);
});
