import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, parseTime, TIPS_TIME, PRODUCTS_TIME } from './notifications.js';

const NOW = new Date(2026, 5, 10, 12, 0, 0); // 10 Jun 2026, 12:00
const PRODUCTS = [
  { productName: 'Maggi Masala Noodles', score: 32, verdict: 'Poor' },
  { productName: 'Saffola Oats', score: 78, verdict: 'Good' },
];

test('nothing is scheduled when both toggles are off', () => {
  assert.deepEqual(buildSchedule({ tips: { on: false }, products: { on: false } }, NOW, PRODUCTS), []);
});

test("today's slot is skipped once its fixed time has passed, tomorrow onward is scheduled", () => {
  // TIPS_TIME defaults to 09:00, already past at 12:00.
  const list = buildSchedule({ tips: { on: true }, products: { on: false } }, NOW);
  assert.equal(list.length, 6); // 7 days ahead minus today
  assert.equal(list[0].at.getDate(), 11);
  const [h] = parseTime(TIPS_TIME);
  assert.equal(list[0].at.getHours(), h);
});

test("today's slot is kept when the fixed time is still ahead", () => {
  // PRODUCTS_TIME defaults to 18:00, still ahead at 12:00.
  const list = buildSchedule({ tips: { on: false }, products: { on: true } }, NOW, PRODUCTS);
  assert.equal(list.length, 7);
  assert.equal(list[0].at.getDate(), 10);
  const [h] = parseTime(PRODUCTS_TIME);
  assert.equal(list[0].at.getHours(), h);
});

test('tips rotate day by day and each carries the full text for the expanded view', () => {
  const list = buildSchedule({ tips: { on: true }, products: { on: false } }, NOW);
  const bodies = new Set(list.map((n) => n.largeBody));
  assert.ok(bodies.size > 1);
  for (const n of list) assert.ok(n.body.length <= 110);
});

test('product notifications name a real product with its score and open the search for it', () => {
  const [first, second] = buildSchedule({ tips: { on: false }, products: { on: true } }, NOW, PRODUCTS);
  assert.equal(first.body, 'Maggi Masala Noodles — scored 32/100 (Poor)');
  assert.equal(first.route, '/?q=Maggi%20Masala%20Noodles');
  assert.match(second.body, /Saffola Oats/);
});

test('with no products known, the product notification is a generic one', () => {
  const [n] = buildSchedule({ tips: { on: false }, products: { on: true } }, NOW, []);
  assert.match(n.body, /Fresh products/);
  assert.equal(n.route, '/');
});

test('ids never collide between tips and products', () => {
  const list = buildSchedule({ tips: { on: true }, products: { on: true } }, NOW, PRODUCTS);
  assert.equal(new Set(list.map((n) => n.id)).size, list.length);
});

test('parseTime handles good and malformed values', () => {
  assert.deepEqual(parseTime('07:05'), [7, 5]);
  assert.deepEqual(parseTime('garbage', '10:15'), [10, 15]);
  assert.deepEqual(parseTime('25:00'), [9, 0]);
});
