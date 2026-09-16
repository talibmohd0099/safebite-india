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

test('treats dilutable concentrates and small-quantity toppings as small-portion too', () => {
  // Real products, no real serving size on file, each read against the
  // full 100g of the concentrate/syrup itself: Ching's Hot & Sour Soup
  // (438% of daily sodium), Khus Sharbat (152% added sugar), Mountqueen
  // Passion Fruit Squash (52%), Amul and Hershey's Chocolate Syrup (91%
  // and 128%) -- the syrups prove this isn't only about dilution with
  // water; a topping used a spoonful at a time has the same problem.
  for (const name of [
    "Ching's Secret Hot & Sour Veg Soup",
    'Hitkary Shahi Khus Sharbat',
    'Mountqueen Passion Fruit Squash',
    'Amul Chocolate Syrup',
    "Hershey's Chocolate Syrup",
    'Rose Cordial',
    'Orange Juice Concentrate',
  ]) {
    assert.equal(isSmallPortionFood(name), true, `${name} should be treated as a small-portion food`);
  }
});

test('a real serving size always wins over the name, even for a concentrate-sounding product', () => {
  // Two real products that already compute correctly BECAUSE a real
  // serving size is on file (Knorr 11g, Manchow 12g) -- the fix must
  // not start treating these as small-portion just because "soup" (or
  // any other keyword) appears in the name once a trustworthy real
  // number already exists.
  assert.equal(isSmallPortionFood('Knorr hot & sour veg soup', 11), false);
  assert.equal(isSmallPortionFood('Manchow instant soup', 12), false);
  // Even a strong keyword match (butter) must defer to real data.
  assert.equal(isSmallPortionFood('Amul Butter', 15), false);
  // No real serving size -- falls back to the name check as before.
  assert.equal(isSmallPortionFood('Amul Butter', null), true);
  assert.equal(isSmallPortionFood('Amul Butter', undefined), true);
});

test('"concentrate" overrides "juice", and "not from concentrate" is correctly left alone', () => {
  // "Orange Juice Concentrate" also contains "juice", which normally
  // protects a ready-to-drink juice from over-exclusion -- but
  // "concentrate" says the product genuinely is one, and must win.
  assert.equal(isSmallPortionFood('Orange Juice Concentrate'), true);
  // The exact opposite real case: a product whose own label states it
  // is NOT a concentrate must not be flagged for the one thing it says
  // it isn't.
  assert.equal(isSmallPortionFood('Real Activ Coconut Water Not from Concentrate'), false);
});

test("bare 'soup' is included, not just compounds like 'soup mix' -- the real motivating product has neither phrase", () => {
  // "Ching's Secret Hot & Sour Veg Soup" contains neither "soup mix"
  // nor "instant soup" -- only bare "soup" catches it, which is why
  // the keyword had to be the plain word rather than a narrower
  // compound. Safe to do broadly BECAUSE of the servingGrams test
  // above: any soup with a real serving size on file is protected
  // regardless of this keyword, so the only residual risk is a
  // ready-to-drink soup with no real serving data at all -- which
  // just loses a signal quietly, never shows a wrong one loudly.
  assert.equal(isSmallPortionFood('Generic Ready to Eat Tomato Soup'), true);
  assert.equal(isSmallPortionFood('Generic Ready to Eat Tomato Soup', 250), false);
});

test('handles a missing product name without throwing', () => {
  assert.equal(isSmallPortionFood(null), false);
  assert.equal(isSmallPortionFood(''), false);
});
