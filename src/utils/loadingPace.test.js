import test from 'node:test';
import assert from 'node:assert/strict';
import { randomLoadDelayMs, waitForMinimum } from './loadingPace.js';

test('delay is always between 1.0s and 2.5s', () => {
  for (let i = 0; i < 2000; i++) {
    const ms = randomLoadDelayMs();
    assert.ok(ms >= 1000 && ms <= 2500, String(ms));
  }
});

test('most delays are short, a few are long', () => {
  const samples = Array.from({ length: 4000 }, () => randomLoadDelayMs());
  const short = samples.filter((ms) => ms < 1500).length / samples.length;
  const long = samples.filter((ms) => ms >= 2000).length / samples.length;
  assert.ok(short > 0.45 && short < 0.65, `short share ${short}`);
  assert.ok(long > 0.04 && long < 0.16, `long share ${long}`);
});

test('waitForMinimum does not wait when the minimum has already passed', async () => {
  const t = Date.now();
  await waitForMinimum(Date.now() - 5000, 1000);
  assert.ok(Date.now() - t < 100);
});

test('waitForMinimum waits out the remainder', async () => {
  const start = Date.now();
  await waitForMinimum(start, 120);
  assert.ok(Date.now() - start >= 115);
});
