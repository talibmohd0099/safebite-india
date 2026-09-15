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

test('higherProtein flags the absence of a real protein source as a NOTE, never a score-affecting concern', () => {
  const noProtein = { overallScore: 80, ingredients: [ing({ name: 'Sugar', category: 'sweetener' })] };
  const withProtein = { overallScore: 80, ingredients: [ing({ name: 'Soy Protein', category: 'protein', status: 'safe' })] };
  const profile = { priorities: ['higherProtein'] };

  const noProteinResult = calculatePersonalAssessment(noProtein, profile);
  assert.deepEqual(noProteinResult.notes, [{ priorityKey: 'higherProtein' }]);
  assert.deepEqual(noProteinResult.matchedConcerns, []);
  assert.equal(noProteinResult.personalScore, 80); // unchanged -- notes never deduct
  assert.equal(noProteinResult.hasNoConcerns, true); // no score-affecting concern
  assert.equal(noProteinResult.hasNothingToShow, false); // but there IS a note worth showing

  assert.equal(calculatePersonalAssessment(withProtein, profile).hasNothingToShow, true);
});

test('a genuinely fine whole-wheat chapathi does not get penalized or warned for "low protein"', () => {
  // Regression test for a real scanned product: a 45g chapathi with
  // 3.78g real protein used to fail the old "30% of a 50g/day
  // reference" bar (needed 15g) and get flagged "Low protein" with a
  // personal-score penalty -- the same bar a glass of milk or a boiled
  // egg would also fail. Chapathi is a plain carb staple; not being a
  // major protein source isn't a flaw in the food.
  const report = {
    overallScore: 90,
    ingredients: [ing({ name: 'Whole Wheat Flour', category: 'grain', status: 'safe' })],
    realNutrients: { proteinG: 3.78 },
  };
  const profile = { priorities: ['higherProtein'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.equal(result.personalScore, 90); // no penalty at all
  assert.deepEqual(result.matchedConcerns, []);
  assert.deepEqual(result.notes, [{ priorityKey: 'higherProtein' }]); // informational only
});

test('real protein data at or above the notable-contribution cutoff produces no note at all', () => {
  // A boiled egg / glass of milk shaped case -- ~6-8g protein is a real
  // contribution, even though it's nowhere near 15g (the old, too-high bar).
  const report = { overallScore: 88, ingredients: [ing({ name: 'Milk', category: 'protein', status: 'safe' })], realNutrients: { proteinG: 8 } };
  const profile = { priorities: ['higherProtein'] };
  assert.equal(calculatePersonalAssessment(report, profile).hasNothingToShow, true);
});

test('moreWholeFood is also a note-only priority, never a score deduction', () => {
  const report = { overallScore: 75, ingredients: [ing({ name: 'Refined Flour', status: 'safe', penalty: 12 })] };
  const profile = { priorities: ['moreWholeFood'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.equal(result.personalScore, 75);
  assert.deepEqual(result.notes, [{ priorityKey: 'moreWholeFood' }]);
});

test('a real avoid-type concern and a seek-more note can coexist -- only the concern affects score', () => {
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Salt', category: 'seasoning', status: 'concerning' })],
    realNutrients: { proteinG: 1 },
  };
  const profile = { priorities: ['lowerSodium', 'higherProtein'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.deepEqual(result.matchedConcerns, [{ priorityKey: 'lowerSodium' }]);
  assert.deepEqual(result.notes, [{ priorityKey: 'higherProtein' }]);
  assert.equal(result.personalScore, 62); // only the one concern deducted (70 - 8)
});

test('a real sodium number (Open Food Facts/Blinkit) wins over the ingredient-tag heuristic', () => {
  // 700mg is 35% of the 2000mg WHO daily limit -- above the 30% bar.
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Water' })], // no ingredient-level signal on its own
    realNutrients: { sodiumMg: 700 },
  };
  const profile = { priorities: ['lowerSodium'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.deepEqual(result.matchedConcerns, [{ priorityKey: 'lowerSodium' }]);
});

test('a real sodium number below the "worth mentioning" bar does not flag a concern, even if an ingredient looks concerning', () => {
  // 200mg is only 10% of the daily limit -- below the 30% bar. The real
  // number is trusted over the ingredient tag once it's present.
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Salt', status: 'concerning' })],
    realNutrients: { sodiumMg: 200 },
  };
  const profile = { priorities: ['lowerSodium'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.equal(result.hasNoConcerns, true);
});

test('real calorie data (previously nonexistent) now makes lowerCalories actually work', () => {
  // 900 kcal is 45% of the 2000 kcal reference -- above the 30% bar.
  const withRealData = {
    overallScore: 70,
    ingredients: [ing({ name: 'Water' })],
    realNutrients: { caloriesKcal: 900 },
  };
  const profile = { priorities: ['lowerCalories'] };
  assert.deepEqual(calculatePersonalAssessment(withRealData, profile).matchedConcerns, [{ priorityKey: 'lowerCalories' }]);
});

test('lowerCalories still never fabricates a concern when no real calorie data exists at all', () => {
  const report = { overallScore: 70, ingredients: [ing({ name: 'Sugar', category: 'sweetener', status: 'concerning' })] };
  const profile = { priorities: ['lowerCalories'] };
  assert.equal(calculatePersonalAssessment(report, profile).hasNoConcerns, true);
});

test('real protein data (2g, below the 5g notable-contribution cutoff) overrides a false-positive ingredient tag with a note, not a concern', () => {
  const report = {
    overallScore: 70,
    ingredients: [ing({ name: 'Soy Protein', category: 'protein', status: 'safe' })], // would otherwise read as "has protein"
    realNutrients: { proteinG: 2 },
  };
  const profile = { priorities: ['higherProtein'] };
  const result = calculatePersonalAssessment(report, profile);
  assert.deepEqual(result.notes, [{ priorityKey: 'higherProtein' }]);
  assert.equal(result.personalScore, 70); // never deducted
});

test('real protein data (20g) confirms a genuinely protein-rich product has nothing to show at all', () => {
  const report = { overallScore: 70, ingredients: [ing({ name: 'Water' })], realNutrients: { proteinG: 20 } };
  const profile = { priorities: ['higherProtein'] };
  assert.equal(calculatePersonalAssessment(report, profile).hasNothingToShow, true);
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
