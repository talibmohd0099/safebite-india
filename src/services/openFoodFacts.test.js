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
