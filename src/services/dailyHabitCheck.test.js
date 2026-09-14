// src/services/dailyHabitCheck.test.js
//
// Run with: node --test src/services/dailyHabitCheck.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyHabitCheck } from './dailyHabitCheck.js';

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
