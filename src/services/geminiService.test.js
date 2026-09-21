// src/services/geminiService.test.js
//
// Only tests the pure, deterministic pieces of this file -- no network
// calls, no API key needed. Run with: node --test src/services/geminiService.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksSelfDisqualifying } from './geminiService.js';

test('catches a real response that contradicted its own recognized:true', () => {
  // The actual Gemini response for "Quot" (see ingredientParser.test.js's
  // "&quot;" regression) -- recognized was left true, but its own
  // explanation says otherwise.
  const record = {
    recognized: true,
    reason: 'This is a typographical error or formatting artifact, not an ingredient.',
    whatIsIt: 'A character representing a quotation mark often found in poorly parsed label data.',
    healthEffects: 'Harmless as it is not a food substance.',
  };
  assert.equal(looksSelfDisqualifying(record), true);
});

test('does not flag a real ingredient\'s ordinary health-effects text', () => {
  const record = {
    recognized: true,
    reason: 'A common preservative used to prevent mould growth in baked goods.',
    whatIsIt: 'A synthetic salt of propionic acid.',
    healthEffects: 'Generally considered safe at permitted levels; no significant risk for most people.',
  };
  assert.equal(looksSelfDisqualifying(record), false);
});

test('does not flag on missing/empty text fields', () => {
  assert.equal(looksSelfDisqualifying({ recognized: true }), false);
  assert.equal(looksSelfDisqualifying({}), false);
});

// Round-robin key rotation (see callGemini): calls spread across every key,
// and a key that is out of quota is benched instead of retried every call.
import { orderKeys, cooldownFor } from './geminiService.js';

test('orderKeys starts at the given key and wraps around', () => {
  assert.deepEqual(orderKeys(5, 0, new Map(), 1000), [0, 1, 2, 3, 4]);
  assert.deepEqual(orderKeys(5, 3, new Map(), 1000), [3, 4, 0, 1, 2]);
});

test('orderKeys moves keys that are still cooling down to the back', () => {
  const cooling = new Map([[1, 5000], [3, 5000]]);
  assert.deepEqual(orderKeys(5, 0, cooling, 1000), [0, 2, 4, 1, 3]);
});

test('a key whose cooldown has passed is healthy again', () => {
  const cooling = new Map([[1, 500]]);
  assert.deepEqual(orderKeys(3, 0, cooling, 1000), [0, 1, 2]);
});

test('when every key is cooling, all are still returned (last resort)', () => {
  const cooling = new Map([[0, 5000], [1, 5000]]);
  assert.deepEqual(orderKeys(2, 0, cooling, 1000).sort(), [0, 1]);
});

test('a daily-quota error benches a key for an hour, a per-minute one for a minute', () => {
  assert.equal(cooldownFor('Quota exceeded for metric ... GenerateRequestsPerDayPerProjectPerModel-FreeTier'), 3600000);
  assert.equal(cooldownFor('You exceeded your current quota (daily limit)'), 3600000);
  assert.equal(cooldownFor('Resource has been exhausted (e.g. check quota). rate limit'), 60000);
});
