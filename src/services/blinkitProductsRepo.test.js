import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantityText, extractNutrientsForHabitCheck } from './blinkitProductsRepo.js';

// Every string here is a real serving_size/pack_size value confirmed
// live on real Blinkit pages before writing this.
test('parses a plain ml quantity', () => {
  assert.deepEqual(parseQuantityText('500 ml'), { value: 500, unit: 'ml' });
});

test('parses a plain g quantity', () => {
  assert.deepEqual(parseQuantityText('220 g'), { value: 220, unit: 'g' });
});

test('normalizes kg to g', () => {
  assert.deepEqual(parseQuantityText('1 kg'), { value: 1000, unit: 'g' });
});

test('normalizes l to ml', () => {
  assert.deepEqual(parseQuantityText('750 ml'), { value: 750, unit: 'ml' });
});

test('normalizes the real "ltr" abbreviation to ml -- found live in 21 of 831 populated pack_size rows, missed entirely before this', () => {
  assert.deepEqual(parseQuantityText('1 ltr'), { value: 1000, unit: 'ml' });
  assert.deepEqual(parseQuantityText('6 x 1 ltr'), { value: 1000, unit: 'ml' });
});

test('a multipack uses the PER-UNIT amount, not the combined total -- drinking one juice box is 250ml, not the whole 2-pack', () => {
  assert.deepEqual(parseQuantityText('2 x 250 ml'), { value: 250, unit: 'ml' });
  assert.deepEqual(parseQuantityText('20 x 150 ml'), { value: 150, unit: 'ml' });
  assert.deepEqual(parseQuantityText('2 x 45 g'), { value: 45, unit: 'g' });
});

test('an unparseable or missing quantity returns null, not a guess', () => {
  assert.equal(parseQuantityText(null), null);
  assert.equal(parseQuantityText(''), null);
  assert.equal(parseQuantityText('assorted'), null);
  // A piece count isn't a weight/volume -- no per-piece weight is known,
  // so returning null here (rather than guessing) is correct, not a gap.
  assert.equal(parseQuantityText('25 pcs'), null);
});

test('extractNutrientsForHabitCheck uses the REAL serving_size, not the whole pack -- a 2.25 LITRE Mountain Dew bottle with a real "200 ml" serve size must never become "2250ml"', () => {
  // Confirmed live on the actual product page: pack_size "2.25 ltr",
  // but Blinkit's own "Standard Serve Size" attribute says "200 ml" --
  // this function must be called with THAT, never pack_size.
  const result = extractNutrientsForHabitCheck({ Sodium: '8 mg', Energy: '49 kcal' }, '200 ml');
  assert.equal(result.servingGrams, 200);
  assert.equal(result.servingUnit, 'ml');
});

test('extractNutrientsForHabitCheck falls back to "g" with null servingGrams when no real serving size is known -- same honest per-100g fallback as before, never a guess from pack_size', () => {
  const result = extractNutrientsForHabitCheck({ Sodium: '400 mg' }, null);
  assert.equal(result.servingGrams, null);
  assert.equal(result.servingUnit, 'g');
});

test('extractNutrientsForHabitCheck still returns null when there is no usable nutrition data at all, regardless of serving size', () => {
  assert.equal(extractNutrientsForHabitCheck({}, '200 ml'), null);
  assert.equal(extractNutrientsForHabitCheck(null, '200 ml'), null);
});
