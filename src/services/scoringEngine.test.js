// src/services/scoringEngine.test.js
//
// Run with: node --test src/services/scoringEngine.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './scoringEngine.js';

function sumPoints(items) {
  return items.reduce((sum, item) => sum + item.points, 0);
}

test('scoreBreakdown items always sum to exactly 100 - rawScore, even with many ingredients rounding independently', () => {
  // Regression test: 14 ingredients, each ~2-7 point contribution.
  // Rounding each one's contribution independently before summing used
  // to accumulate drift -- a real seeded product (Maggi Masala Noodles)
  // showed items summing to 42 (implying a raw score of 58) while the
  // real, correctly-rounded-once score was 61. A user adding up the
  // line items shown on screen must get the same number as "Final
  // score", every time, not just approximately.
  const ingredients = [
    { name: 'Wheat Flour', status: 'safe', penalty: 10, category: 'other', estimatedPercentage: 31.26 },
    { name: 'Palm Oil', status: 'concerning', penalty: 12, category: 'oil', estimatedPercentage: 21.88 },
    { name: 'Salt', status: 'concerning', penalty: 6, category: 'other', estimatedPercentage: 15.32 },
    { name: 'Wheat Gluten', status: 'safe', penalty: 3, category: 'protein', estimatedPercentage: 10.72 },
    { name: 'Calcium Carbonate', status: 'safe', penalty: 2, category: 'other', estimatedPercentage: 7.51 },
    { name: 'Thickeners (INS 508)', status: 'safe', penalty: 1, category: 'flavour enhancer', estimatedPercentage: 2.63 },
    { name: 'Thickeners (INS 412)', status: 'safe', penalty: 1, category: 'thickener', estimatedPercentage: 2.63 },
    { name: 'Acidity Regulators (INS 501(i))', status: 'safe', penalty: 0, category: 'acidity regulator', estimatedPercentage: 1.84 },
    { name: 'Acidity Regulators (INS 500(i))', status: 'safe', penalty: 0, category: 'acidity regulator', estimatedPercentage: 1.84 },
    { name: 'Humectant (INS 451(i))', status: 'safe', penalty: 8, category: 'other', estimatedPercentage: 1.84 },
    { name: 'Hydrolysed Groundnut Protein', status: 'safe', penalty: 8, category: 'protein', estimatedPercentage: 1.84 },
    { name: 'Mixed Spices', status: 'safe', penalty: 1, category: 'spice', estimatedPercentage: 1.84 },
    { name: 'Noodle Powder', status: 'concerning', penalty: 15, category: 'other', estimatedPercentage: 1.84 },
    { name: 'Sugar', status: 'concerning', penalty: 8, category: 'sweetener', estimatedPercentage: 1.84 },
  ];

  const report = buildReport(ingredients, { productName: 'Test Noodles' });
  const { items, rawScore, finalScore } = report.scoreBreakdown;

  assert.equal(100 - sumPoints(items), rawScore, 'displayed line items must sum to exactly 100 - rawScore');
  if (!report.scoreBreakdown.wasCapped) {
    assert.equal(rawScore, finalScore);
  }
});

test('scoreBreakdown items still sum correctly when a harmful/concerning cap is applied', () => {
  const ingredients = [
    { name: 'Refined Wheat Flour Maida', status: 'concerning', penalty: 12, category: 'flour', percentage: 40 },
    { name: 'Palm Oil', status: 'concerning', penalty: 15, category: 'oil', percentage: 20 },
    { name: 'Sugar', status: 'concerning', penalty: 6, category: 'sweetener', percentage: 10 },
    { name: 'Iodised Salt', status: 'safe', penalty: 1, category: 'other', percentage: 2 },
  ];

  const report = buildReport(ingredients, { productName: 'Test' });
  const { items, rawScore, finalScore, wasCapped, capReason } = report.scoreBreakdown;

  assert.equal(wasCapped, true);
  assert.equal(capReason, 'concerning');
  assert.equal(100 - sumPoints(items), rawScore);
  assert.notEqual(rawScore, finalScore); // the cap actually changed the number
});

test('scoreBreakdown is empty (never fabricated) for an all-safe, zero-penalty product', () => {
  const ingredients = [
    { name: 'Water', status: 'safe', penalty: 0, category: 'other' },
    { name: 'Salt', status: 'safe', penalty: 0, category: 'other' },
  ];
  const report = buildReport(ingredients, { productName: 'Test Water' });
  assert.deepEqual(report.scoreBreakdown.items, []);
  assert.equal(report.scoreBreakdown.wasCapped, false);
});
