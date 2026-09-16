// src/utils/shareCard.test.js
//
// Only the pure logic is tested here (word-wrapping, tier colour) --
// the actual drawing needs a real <canvas>, which is verified by
// rendering the card in a browser and looking at it, not in Node.
//
// Run with: node --test src/utils/shareCard.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, tierColorFor } from './shareCard.js';

// A fake measurer: width = character count -- deterministic and
// enough to test the wrapping decision itself without a real font.
const charWidth = (s) => s.length;

test('wraps onto a new line only once the running line would exceed the max width', () => {
  const lines = wrapText('one two three four', 9, charWidth);
  assert.deepEqual(lines, ['one two', 'three', 'four']);
});

test('a single word longer than the max width still gets its own line, not dropped', () => {
  const lines = wrapText('Supercalifragilisticexpialidocious', 10, charWidth);
  assert.deepEqual(lines, ['Supercalifragilisticexpialidocious']);
});

test('collapses repeated whitespace and trims, same as a real product name might have', () => {
  const lines = wrapText('  Maggi    2-Minute   Noodles  ', 100, charWidth);
  assert.deepEqual(lines, ['Maggi 2-Minute Noodles']);
});

test('an empty or missing name produces no lines, not a crash', () => {
  assert.deepEqual(wrapText('', 100, charWidth), []);
  assert.deepEqual(wrapText(null, 100, charWidth), []);
});

test('tier colour follows the same 85/65/45/25 breakpoints as the score circle', () => {
  assert.equal(tierColorFor(90), '#1e8e3e');
  assert.equal(tierColorFor(70), '#34c759');
  assert.equal(tierColorFor(50), '#e6a700');
  assert.equal(tierColorFor(30), '#ff9500');
  assert.equal(tierColorFor(10), '#ff3b30');
});
