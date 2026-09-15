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
