import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePackSize, extractNutrientsForHabitCheck } from './blinkitProductsRepo.js';

// Every string here is a real pack_size value pulled live from the
// blinkit_products table before writing the parser.
test('parses a plain ml pack size', () => {
  assert.deepEqual(parsePackSize('500 ml'), { value: 500, unit: 'ml' });
});

test('parses a plain g pack size', () => {
  assert.deepEqual(parsePackSize('220 g'), { value: 220, unit: 'g' });
});

test('normalizes kg to g', () => {
  assert.deepEqual(parsePackSize('1 kg'), { value: 1000, unit: 'g' });
});

test('normalizes l to ml', () => {
  assert.deepEqual(parsePackSize('750 ml'), { value: 750, unit: 'ml' });
});

test('a multipack uses the PER-UNIT amount, not the combined total -- drinking one juice box is 250ml, not the whole 2-pack', () => {
  assert.deepEqual(parsePackSize('2 x 250 ml'), { value: 250, unit: 'ml' });
  assert.deepEqual(parsePackSize('20 x 150 ml'), { value: 150, unit: 'ml' });
  assert.deepEqual(parsePackSize('2 x 45 g'), { value: 45, unit: 'g' });
});

test('an unparseable or missing pack size returns null, not a guess', () => {
  assert.equal(parsePackSize(null), null);
  assert.equal(parsePackSize(''), null);
  assert.equal(parsePackSize('assorted'), null);
});

test('extractNutrientsForHabitCheck uses the real pack size and unit when given one', () => {
  const result = extractNutrientsForHabitCheck({ Sodium: '400 mg', Energy: '150 kcal' }, '500 ml');
  assert.equal(result.servingGrams, 500);
  assert.equal(result.servingUnit, 'ml');
});

test('extractNutrientsForHabitCheck falls back to "g" with null servingGrams when pack_size is unknown -- same honest per-100g fallback as before', () => {
  const result = extractNutrientsForHabitCheck({ Sodium: '400 mg' }, null);
  assert.equal(result.servingGrams, null);
  assert.equal(result.servingUnit, 'g');
});

test('extractNutrientsForHabitCheck still returns null when there is no usable nutrition data at all, regardless of pack_size', () => {
  assert.equal(extractNutrientsForHabitCheck({}, '500 ml'), null);
  assert.equal(extractNutrientsForHabitCheck(null, '500 ml'), null);
});
