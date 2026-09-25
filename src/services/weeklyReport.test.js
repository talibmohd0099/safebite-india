import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, scanStreak } from './weeklyReport.js';

const NOW = Date.parse('2026-09-25T12:00:00');
const daysAgo = (d, h = 0) => new Date(NOW - d * 86400000 - h * 3600000).toISOString();
const palm = { name: 'Palm Oil', status: 'concerning', penalty: 12 };
const flour = { name: 'Wheat Flour', status: 'safe', penalty: 2 };

const history = [
  { id: '1', productName: 'Chips', overallScore: 40, savedAt: daysAgo(0), ingredients: [palm, flour] },
  { id: '2', productName: 'Biscuit', overallScore: 60, savedAt: daysAgo(1), ingredients: [palm] },
  { id: '3', productName: 'Chips', overallScore: 40, savedAt: daysAgo(2), ingredients: [palm] }, // same product again
  { id: '4', productName: 'Oats', overallScore: 95, savedAt: daysAgo(2), ingredients: [flour] },
  { id: '5', productName: 'Cola', overallScore: 30, savedAt: daysAgo(9), ingredients: [] },
  { id: '6', productName: 'Old', overallScore: 50, savedAt: daysAgo(20), ingredients: [] },
];

test('the last 7 days, one entry per product', () => {
  const r = buildWeeklyReport(history, NOW);
  assert.equal(r.count, 3);
  assert.equal(r.averageScore, 65); // (40 + 60 + 95) / 3
  assert.equal(r.previousAverage, 30);
  assert.deepEqual(r.tiers, { excellent: 1, good: 0, moderate: 1, poor: 1, veryPoor: 0 });
  assert.deepEqual(r.topFlag, { name: 'Palm Oil', count: 2 });
  assert.equal(r.best.productName, 'Oats');
  assert.equal(r.worst.productName, 'Chips');
});

test('streak counts consecutive days, and survives until the first scan of today', () => {
  assert.equal(scanStreak(history, NOW), 3); // today, yesterday, 2 days ago
  assert.equal(scanStreak(history.slice(1), NOW), 2); // no scan today yet: yesterday + day before
  assert.equal(scanStreak([], NOW), 0);
});

test('null when nothing was checked this week; infant formula never counted', () => {
  assert.equal(buildWeeklyReport(history.slice(4), NOW), null);
  assert.equal(buildWeeklyReport([{ id: 'x', productName: 'Formula', isInfantFormula: true, overallScore: 80, savedAt: daysAgo(0) }], NOW), null);
});
