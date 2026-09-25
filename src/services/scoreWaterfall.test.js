import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScoreWaterfall } from './scoreWaterfall.js';
import { buildReport, applyRealNutrientCap } from './scoringEngine.js';

const ings = [
  { name: 'Wheat Flour', status: 'safe', penalty: 10, percentage: 60 },
  { name: 'Palm Oil', status: 'concerning', penalty: 12, percentage: 20 },
  { name: 'Sugar', status: 'safe', penalty: 8, percentage: 15 },
  { name: 'Salt', status: 'safe', penalty: 1, percentage: 2 },
];

test('lands exactly on the real engine score, with the cap as its own step', () => {
  const report = buildReport(ings, { productName: 'Test Biscuit' });
  const w = buildScoreWaterfall(report);
  assert.equal(w.final, report.overallScore);
  assert.equal(w.steps[0].from, 100);
  assert.equal(w.steps.at(-1).to, report.overallScore);
  // each step starts where the previous ended
  for (let i = 1; i < w.steps.length; i++) assert.equal(w.steps[i].from, w.steps[i - 1].to);
  assert.equal(w.steps[0].name, 'Wheat Flour'); // biggest weighted bite first
});

test('the Quick Health Check cap is its own step', () => {
  const clean = [{ name: 'Potato', status: 'safe', penalty: 2, percentage: 90 }];
  const report = buildReport(clean, {});
  report.dailyHabitCheck = { nutrientKey: 'saturatedFatG', percent: 75 };
  applyRealNutrientCap(report, report.dailyHabitCheck);
  const w = buildScoreWaterfall(report);
  assert.equal(w.steps.at(-1).kind, 'nutrientCap');
  assert.equal(w.final, report.overallScore);
});

test('the density ceiling is its own step', () => {
  const report = buildReport([{ name: 'Potato', status: 'safe', penalty: 2, percentage: 90 }], {});
  report.overallScoreBeforeDensity = report.overallScore;
  report.overallScore = 55;
  assert.equal(buildScoreWaterfall(report).steps.at(-1).kind, 'densityCeiling');
});

test('returns null when it cannot reproduce the stored score (older formula)', () => {
  const report = buildReport(ings, {});
  assert.equal(buildScoreWaterfall({ ...report, overallScore: report.overallScore - 7 }), null);
  assert.equal(buildScoreWaterfall({ overallScore: 80, ingredients: [] }), null);
});
