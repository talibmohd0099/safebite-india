// src/services/scoringEngine.test.js
//
// Run with: node --test src/services/scoringEngine.test.js
// (or `npm test`, which runs every *.test.js file under src/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, applyRealNutrientCap } from './scoringEngine.js';

function ing(overrides) {
  return { name: 'Ingredient', status: 'safe', category: null, penalty: 0, insCode: null, ...overrides };
}

test('a clean ingredient list with no real nutrient data scores unaffected', () => {
  const report = buildReport([ing({ name: 'Potato' }), ing({ name: 'Salt', penalty: 3 })], {});
  const before = report.overallScore;
  applyRealNutrientCap(report, null);
  assert.equal(report.overallScore, before);
});

test('a real saturated-fat number that clears the "worth mentioning" bar caps an otherwise-clean product at Moderate, at most', () => {
  // Regression for a real scanned product: Bingo Potato Chips Salted --
  // ingredients are just potato/oil/salt (nothing artificial to flag),
  // scoring 92 ("Very Healthy") on ingredients alone, while its OWN
  // Quick Health Check section already said 75% of the daily saturated
  // fat limit in one serving. The score never reflected that until now.
  const report = buildReport(
    [ing({ name: 'Potato' }), ing({ name: 'Edible Vegetable Oil', category: 'oil', penalty: 12 }), ing({ name: 'Iodized Salt', penalty: 3 })],
    {}
  );
  assert.ok(report.overallScore >= 85); // confirms the "clean ingredients" starting point
  const habitCheck = { nutrientKey: 'saturatedFatG', nutrientLabel: 'saturated fat', amount: 16.6, limit: 22, unit: 'g', percent: 75, servingGrams: null };
  applyRealNutrientCap(report, habitCheck);
  assert.ok(report.overallScore <= 64);
  assert.equal(report.verdict, 'Moderate');
});

test('a real nutrient number that does NOT clear the 30% bar (dailyHabitCheck.js already returns null) never triggers the cap', () => {
  const report = buildReport([ing({ name: 'Potato' })], {});
  const before = report.overallScore;
  applyRealNutrientCap(report, null); // buildDailyHabitCheck already returned null upstream
  assert.equal(report.overallScore, before);
});

test('the nutrient cap never RAISES a score that ingredients already put lower', () => {
  const report = buildReport(
    [ing({ name: 'Tartrazine', status: 'harmful', penalty: 40 })],
    {}
  );
  const before = report.overallScore;
  const habitCheck = { nutrientKey: 'sodiumMg', nutrientLabel: 'sodium', amount: 1500, limit: 2000, unit: 'mg', percent: 75, servingGrams: null };
  applyRealNutrientCap(report, habitCheck);
  assert.equal(report.overallScore, before); // squeezeToCap is a no-op when already below the cap
});

test('applyRealNutrientCap with no habitCheck at all leaves the report untouched', () => {
  const report = buildReport([ing({ name: 'Potato' })], {});
  const before = { score: report.overallScore, verdict: report.verdict };
  const result = applyRealNutrientCap(report, undefined);
  assert.equal(result.overallScore, before.score);
  assert.equal(result.verdict, before.verdict);
});
