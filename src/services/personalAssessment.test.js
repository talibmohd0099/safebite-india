// src/services/personalAssessment.test.js
//
// Run with: node --test src/services/personalAssessment.test.js
// (or `npm test`, which runs every *.test.js file under src/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePersonalAssessment, getPersonalScoreColor } from './personalAssessment.js';

function ing(overrides) {
  return { name: 'Ingredient', status: 'safe', category: null, penalty: 0, insCode: null, ...overrides };
}

test('personal score never exceeds the universal score', () => {
  const report = { overallScore: 90, ingredients: [ing({ name: 'Water' })] };
  const profile = { priorities: ['lowerSugar', 'lowerSodium'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.ok(result.personalScore <= 90);
  assert.equal(result.hasNoConcerns, true);
});

test('a concerning sweetener lowers the personal score for someone watching sugar', () => {
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Sugar', category: 'sweetener', status: 'concerning', penalty: 6 })],
  };
  const profile = { priorities: ['lowerSugar'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.ok(result.personalScore < 70);
  assert.deepEqual(result.matchedConcerns, [{ priorityKey: 'lowerSugar' }]);
});

test('a priority not selected never affects the personal score, even with a matching ingredient', () => {
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Sugar', category: 'sweetener', status: 'concerning' })],
  };
  const profile = { priorities: ['lowerSodium'] }; // sugar is NOT selected
  const result = calculatePersonalAssessment(report, profile);
  assert.equal(result.personalScore, 70);
  assert.equal(result.hasNoConcerns, true);
});

test('reuses the existing "Highly processed" ingredient tier for lessProcessed, not a new classification', () => {
  const report = {
    overallScore: 65,
    ingredients: [ing({ name: 'Refined Flour', status: 'safe', penalty: 12 })], // >= NOTABLE_PENALTY (9)
  };
  const profile = { priorities: ['lessProcessed'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.deepEqual(result.matchedConcerns, [{ priorityKey: 'lessProcessed' }]);
});

test('higherProtein flags the absence of a real protein source, not the presence of a bad one', () => {
  const noProtein = { overallScore: 80, ingredients: [ing({ name: 'Sugar', category: 'sweetener' })] };
  const withProtein = { overallScore: 80, ingredients: [ing({ name: 'Soy Protein', category: 'protein', status: 'safe' })] };
  const profile = { priorities: ['higherProtein'] };

  assert.deepEqual(calculatePersonalAssessment(noProtein, profile).matchedConcerns, [{ priorityKey: 'higherProtein' }]);
  assert.equal(calculatePersonalAssessment(withProtein, profile).hasNoConcerns, true);
});

test('a real nutrition-panel signal (dailyHabitCheck) adds a concern when it matches a selected priority', () => {
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Water' })], // no ingredient-level signal on its own
    dailyHabitCheck: { nutrientKey: 'sodiumMg', percent: 45 },
  };
  const profile = { priorities: ['lowerSodium'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.deepEqual(result.matchedConcerns, [{ priorityKey: 'lowerSodium' }]);
});

test('the same concern is never counted twice when both the ingredient signal and dailyHabitCheck agree', () => {
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Salt', status: 'concerning' })],
    dailyHabitCheck: { nutrientKey: 'sodiumMg', percent: 45 },
  };
  const profile = { priorities: ['lowerSodium'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.equal(result.matchedConcerns.length, 1);
});

test('lowerCalories never fabricates a concern -- no reliable per-ingredient signal exists', () => {
  const report = { overallScore: 70, ingredients: [ing({ name: 'Sugar', category: 'sweetener', status: 'concerning' })] };
  const profile = { priorities: ['lowerCalories'] };
  assert.equal(calculatePersonalAssessment(report, profile).hasNoConcerns, true);
});

test('personal score tier colors reuse the same 85/65/45/25 breakpoints as the universal score', () => {
  assert.equal(getPersonalScoreColor(90).label, 'Good Choice');
  assert.equal(getPersonalScoreColor(70).label, 'Moderate');
  assert.equal(getPersonalScoreColor(50).label, 'Limit');
  assert.equal(getPersonalScoreColor(30).label, 'Occasional');
  assert.equal(getPersonalScoreColor(10).label, 'Avoid');
});

test('handles a profile with no priorities selected at all', () => {
  const report = { overallScore: 55, ingredients: [ing({ status: 'concerning' })] };
  const result = calculatePersonalAssessment(report, { priorities: [] });
  assert.equal(result.personalScore, 55);
  assert.equal(result.hasNoConcerns, true);
});
