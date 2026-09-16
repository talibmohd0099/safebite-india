// src/services/dailyHabitCheck.test.js
//
// Run with: node --test src/services/dailyHabitCheck.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyHabitCheck, isSmallPortionFood } from './dailyHabitCheck.js';

test('picks the nutrient with the highest percent of its WHO daily limit', () => {
  const result = buildDailyHabitCheck(
    { sodiumMg: 820, addedSugarG: 5, saturatedFatG: 2 },
    70
  );
  assert.equal(result.nutrientKey, 'sodiumMg');
  assert.equal(result.percent, 41); // 820 / 2000 = 41%
  assert.equal(result.servingGrams, 70);
});

test('returns null when nothing clears the 30% "worth showing" bar', () => {
  const result = buildDailyHabitCheck({ sodiumMg: 400, addedSugarG: 3 }, 70);
  assert.equal(result, null);
});

test('returns null with no nutrient data at all', () => {
  assert.equal(buildDailyHabitCheck(null, 70), null);
  assert.equal(buildDailyHabitCheck({}, 70), null);
});

test('still works with a null servingGrams (the "no known pack size, use per-100g" case)', () => {
  const result = buildDailyHabitCheck({ sodiumMg: 3000 }, null);
  assert.equal(result.nutrientKey, 'sodiumMg');
  assert.equal(result.servingGrams, null);
});

test('ignores a zero or negative value instead of treating it as real data', () => {
  const result = buildDailyHabitCheck({ sodiumMg: 0, addedSugarG: 40 }, null);
  assert.equal(result.nutrientKey, 'addedSugarG');
});

test('treats spoonful foods as small-portion, so a full day\'s limit is never read against 100g of them', () => {
  // All real products caught by a backfill dry run, each about to be
  // capped on a number nobody would ever eat in one sitting: butter at
  // 218% of a day's saturated fat per 100g, mustard oil at 45%.
  for (const name of [
    'Amul Butter',
    'Butter School Pack',
    'Emami Healthy & Tasty Mustard Oil',
    'Classic Kachi Ghani Mustard Oil',
    'Tata Sampann Chaat Masala',
    'Chilly Papad',
    'Everest Pani Puri Masala',
    'Iodised Salt',
  ]) {
    assert.equal(isSmallPortionFood(name), true, `${name} should be treated as a small-portion food`);
  }
});

test('a real meal or snack that merely mentions masala/butter/oats is still judged on a normal serving', () => {
  // The trap in a plain keyword match: "masala oats" is a breakfast
  // bowl and "masala noodles" is a meal -- both eaten in real portions,
  // both correctly subject to the daily-limit framing, despite the word
  // "masala" sitting in the name.
  for (const name of [
    'saffola masala oats',
    'Special Masala Noodles',
    'Maggi Masala Noodles',
    'Butter Biscuit',
    'Parle G biscuit',
    'Cadbury Dairy Milk',
    'peanut chikki',
    'Paneer',
  ]) {
    assert.equal(isSmallPortionFood(name), false, `${name} should NOT be treated as a small-portion food`);
  }
});

test('handles a missing product name without throwing', () => {
  assert.equal(isSmallPortionFood(null), false);
  assert.equal(isSmallPortionFood(''), false);
});
