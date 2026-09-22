// src/services/openFoodFacts.test.js
//
// Only tests the pure, deterministic pieces of this file -- no network
// calls. Run with: node --test src/services/openFoodFacts.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServingGrams, extractNutrientsForHabitCheck } from './openFoodFacts.js';

test('does not mistake a serving COUNT for the gram weight in "1 serving (100 g)"', () => {
  // Regression test for a real product (Dal Makhani): the naive "pull
  // the leading number" reading grabbed the "1" (a count) instead of
  // the "100" (the actual weight) that follows in parentheses -- which
  // silently scaled every real nutrient number down by 100x before this
  // was caught (91kcal/100g became 0.91kcal).
  assert.equal(parseServingGrams('1 serving (100 g)', null), 100);
});

test('does not mistake a pack count for the gram weight in "1 pack (35g)"', () => {
  assert.equal(parseServingGrams('1 pack (35g)', null), 35);
});

test('still handles a plain "70 g" / "70g" serving size', () => {
  assert.equal(parseServingGrams('70 g', null), 70);
  assert.equal(parseServingGrams('70g', null), 70);
});

test('falls back to product_quantity when serving_size has no gram weight at all', () => {
  assert.equal(parseServingGrams('1 sachet', '40'), 40);
  assert.equal(parseServingGrams(null, '40'), 40);
});

test('returns null when neither field has a usable number', () => {
  assert.equal(parseServingGrams('1 sachet', null), null);
});

test('extractNutrientsForHabitCheck scales per-100g figures correctly using the real pack weight', () => {
  // Same real product's real numbers: 91kcal, 5.1g protein, 283mg
  // sodium per 100g, serving_size "1 serving (100 g)" -- since the pack
  // IS genuinely 100g here, the scale factor is 1x and the fix mainly
  // guards against the 100x-too-small failure mode, not a visible
  // change for this particular product.
  const product = {
    serving_size: '1 serving (100 g)',
    nutriments: {
      sodium_100g: 0.283,
      sugars_100g: 1,
      'saturated-fat_100g': 0.4,
      'energy-kcal_100g': 91,
      proteins_100g: 5.1,
    },
  };
  const result = extractNutrientsForHabitCheck(product);
  assert.equal(result.servingGrams, 100);
  assert.equal(Math.round(result.nutrients.sodiumMg), 283);
  assert.equal(result.nutrients.caloriesKcal, 91);
  assert.equal(result.nutrients.proteinG, 5.1);
});

test('extractNutrientsForHabitCheck scales up correctly for a smaller multipack unit', () => {
  // "1 pack (35g)" on a per-100g basis of 500kcal/100g -- the real pack
  // itself should carry 175kcal (35g is 35% of 100g), not 500kcal.
  const product = {
    serving_size: '1 pack (35g)',
    nutriments: { 'energy-kcal_100g': 500, proteins_100g: 10 },
  };
  const result = extractNutrientsForHabitCheck(product);
  assert.equal(result.servingGrams, 35);
  assert.equal(result.nutrients.caloriesKcal, 175);
  assert.equal(result.nutrients.proteinG, 3.5);
});

test('returns null when the product has no nutriments at all', () => {
  assert.equal(extractNutrientsForHabitCheck({ serving_size: '100 g' }), null);
  assert.equal(extractNutrientsForHabitCheck(null), null);
});

test('extracts the full printed panel, not just the nutrients scoring happens to use', () => {
  // A real Parle-G response. The Nutrition section was showing only 5-6
  // rows for nearly every product because only the WHO-limit nutrients
  // plus calories/protein were ever pulled out -- the rest of the panel
  // sitting in the same response went unread.
  const result = extractNutrientsForHabitCheck({
    nutriments: {
      'energy-kcal_100g': 454, proteins_100g: 6.9, carbohydrates_100g: 77.3,
      sugars_100g: 25.5, 'added-sugars_100g': 21.16, fat_100g: 13,
      'saturated-fat_100g': 6, 'trans-fat_100g': 0.1, cholesterol_100g: 0.002,
      fiber_100g: 1.4, sodium_100g: 0.296,
    },
  });
  assert.deepEqual(result.nutrients, {
    caloriesKcal: 454, proteinG: 6.9, carbohydrateG: 77.3, addedSugarG: 21.16,
    totalSugarG: 25.5, totalFatG: 13, saturatedFatG: 6, transFatG: 0.1,
    cholesterolMg: 2, fibreG: 1.4, sodiumMg: 296,
  });
});

test('does not print one sugar measurement twice under two different names', () => {
  // With no added-sugars field, addedSugarG deliberately falls back to
  // the total -- so a separate "total sugar" row would be the exact
  // same number relabelled, reading as two independent measurements.
  const result = extractNutrientsForHabitCheck({
    nutriments: { sugars_100g: 18, proteins_100g: 2 },
  });
  assert.equal(result.nutrients.addedSugarG, 18);
  assert.equal('totalSugarG' in result.nutrients, false);
});

test('scaled figures are stored rounded, not as floating-point noise', () => {
  const result = extractNutrientsForHabitCheck({
    serving_size: '70 g',
    nutriments: { sodium_100g: 1.0285714, proteins_100g: 8.5714 },
  });
  assert.equal(result.nutrients.sodiumMg, 720);
  assert.equal(result.nutrients.proteinG, 6);
});

// A real, confirmed OFF data-quality bug (not invented): a contributor
// types the MILLIGRAM figure into sodium_100g, a field OFF's schema
// defines as grams -- naively multiplying by 1000 then produces a
// million-scale sodium reading. Sunfeast YiPPee! Noodles' actual live OFF
// entry has sodium_100g: 1247.1 (confirmed against the real API); real
// instant-noodle sodium is ~1,200mg/100g.
test('a sodium_100g value already past what pure salt can reach is treated as already-mg, not multiplied by 1000 again', () => {
  const result = extractNutrientsForHabitCheck({
    nutriments: { sodium_100g: 1247.1, 'energy-kcal_100g': 459, proteins_100g: 9 },
  });
  assert.equal(result.nutrients.sodiumMg, 1247.1);
  assert.equal(result.nutrientsPer100.sodiumMg, 1247.1);
});

test('a genuinely high but physically real gram-scale sodium reading (near pure salt) is still trusted as grams', () => {
  // A real product this must NOT misfire on: a near-pure salt/seasoning
  // blend can legitimately state close to salt's own sodium ceiling.
  const result = extractNutrientsForHabitCheck({
    nutriments: { sodium_100g: 38, 'energy-kcal_100g': 0 },
  });
  assert.equal(result.nutrients.sodiumMg, 38000);
});

test('an ordinary, unremarkable sodium_100g value is untouched by the guard', () => {
  const result = extractNutrientsForHabitCheck({
    nutriments: { sodium_100g: 0.283, 'energy-kcal_100g': 91 },
  });
  assert.equal(result.nutrients.sodiumMg, 283);
});
