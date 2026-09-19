// src/services/compareProducts.test.js
//
// Run with: node --test src/services/compareProducts.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparisonRows, describeDifferences } from './compareProducts.js';

// Two real-shape instant noodle products (Maggi vs. a lower-sodium
// alternative), numbers in the plausible real range for this category
// (Maggi's own label lists sodium in the 1000-1200mg/100g range).
const MAGGI = {
  lookupKey: 'barcode:maggi',
  productName: 'Maggi 2-Minute Noodles',
  overallScore: 47,
  realNutrients: { sodiumMg: 1100, addedSugarG: 2, proteinG: 9 },
  ingredients: [
    { name: 'Palm Oil', insCode: null },
    { name: 'Wheat Flour', insCode: null },
    { name: 'Flavour Enhancer', insCode: '635' },
    { name: 'Acidity Regulator', insCode: '501' },
  ],
};

const LOWER_SODIUM_ALT = {
  lookupKey: 'barcode:alt',
  productName: 'Sunfeast Yippee Noodles',
  overallScore: 61,
  realNutrients: { sodiumMg: 650, addedSugarG: 2, proteinG: 10 },
  ingredients: [
    { name: 'Wheat Flour', insCode: null },
    { name: 'Salt', insCode: null },
  ],
};

test('buildComparisonRows pulls sodium/sugar/protein/additives from realNutrients + ingredients', () => {
  const rows = buildComparisonRows([MAGGI, LOWER_SODIUM_ALT]);
  assert.equal(rows[0].sodiumMg, 1100);
  assert.equal(rows[0].proteinG, 9);
  assert.equal(rows[0].additives, 2); // insCode 635 and 501
  assert.equal(rows[1].additives, 0);
});

test('buildComparisonRows falls back to totalSugarG when addedSugarG is missing', () => {
  const rows = buildComparisonRows([{ ...MAGGI, realNutrients: { totalSugarG: 3 } }]);
  assert.equal(rows[0].sugarG, 3);
});

test('buildComparisonRows omits a personalScore with no active profile, includes one when given', () => {
  const [withoutProfile] = buildComparisonRows([MAGGI]);
  assert.equal(withoutProfile.personalScore, null);

  const profile = { priorities: ['lowerSodium'] };
  const [withProfile] = buildComparisonRows([MAGGI], profile);
  assert.equal(typeof withProfile.personalScore, 'number');
  assert.ok(withProfile.personalScore <= MAGGI.overallScore);
});

test('describeDifferences names the real, large gaps between the best- and worst-scoring product', () => {
  const rows = buildComparisonRows([MAGGI, LOWER_SODIUM_ALT]);
  const sentence = describeDifferences(rows);
  assert.match(sentence, /^Sunfeast Yippee Noodles has /);
  assert.match(sentence, /lower sodium/);
  assert.match(sentence, /fewer additive-related concerns/);
  assert.match(sentence, /than Maggi 2-Minute Noodles\.$/);
  // Protein and sugar are close enough (9 vs 10, 2 vs 2) that they must
  // NOT be named -- only real, large gaps belong in this sentence.
  assert.doesNotMatch(sentence, /protein/);
  assert.doesNotMatch(sentence, /sugar/);
});

test('describeDifferences returns null when fewer than 2 products have a real score', () => {
  assert.equal(describeDifferences(buildComparisonRows([MAGGI])), null);
  assert.equal(describeDifferences([]), null);
});

test('describeDifferences returns null when two products score identically (no real winner to compare from)', () => {
  const rows = buildComparisonRows([MAGGI, { ...LOWER_SODIUM_ALT, overallScore: MAGGI.overallScore }]);
  assert.equal(describeDifferences(rows), null);
});

test('describeDifferences ignores a metric with no real data on one side rather than guessing', () => {
  const noData = { ...LOWER_SODIUM_ALT, realNutrients: {} };
  const rows = buildComparisonRows([MAGGI, noData]);
  const sentence = describeDifferences(rows);
  // Sodium/sugar/protein are all unknown for the alternative now --
  // only additives (a count derived from ingredients, always known)
  // can still be compared.
  assert.match(sentence, /fewer additive-related concerns/);
  assert.doesNotMatch(sentence, /sodium/);
});

test('describeDifferences never names a metric where the LOWER-scoring product is actually better on it', () => {
  // A real, plausible case: the lower-scoring product has less sodium
  // (a point in its favour) but still scores worse overall because of
  // something else (e.g. more additives) -- the sentence must not claim
  // the winner "has lower sodium" when it doesn't.
  const higherScoreButMoreSodium = { ...LOWER_SODIUM_ALT, overallScore: 70, realNutrients: { sodiumMg: 1400, proteinG: 9 } };
  const rows = buildComparisonRows([MAGGI, higherScoreButMoreSodium]);
  const sentence = describeDifferences(rows);
  assert.doesNotMatch(sentence, /sodium/);
});

test('personal-score comparisons rank by personalScore, not the universal score', () => {
  // A profile whose priority the lower-scoring product actually satisfies
  // better -- personal ranking should flip who counts as "best" here.
  const profile = { priorities: ['lowerSodium'] };
  const rows = buildComparisonRows([MAGGI, LOWER_SODIUM_ALT], profile);
  const sentence = describeDifferences(rows);
  assert.match(sentence, /^Sunfeast Yippee Noodles has /);
});
