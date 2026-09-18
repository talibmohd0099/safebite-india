// src/utils/csv.test.js
//
// Run with: node --test src/utils/csv.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvObjects } from './csv.js';

test('parses a simple header + rows', () => {
  const rows = parseCsvObjects('productName,brand\nMaggi,Nestle\nLay\'s,PepsiCo');
  assert.deepEqual(rows, [
    { productname: 'Maggi', brand: 'Nestle' },
    { productname: "Lay's", brand: 'PepsiCo' },
  ]);
});

test('a quoted field can contain commas, which is the whole point for an ingredients column', () => {
  const rows = parseCsvObjects('productName,ingredientsText\nBiscuit,"Sugar, Wheat Flour, Palm Oil"');
  assert.equal(rows[0].ingredientstext, 'Sugar, Wheat Flour, Palm Oil');
});

test('a doubled quote inside a quoted field is an escaped literal quote', () => {
  const rows = parseCsvObjects('name,note\n"Product","says ""fresh"" on pack"');
  assert.equal(rows[0].note, 'says "fresh" on pack');
});

test('blank lines are dropped, not turned into empty rows', () => {
  const rows = parseCsvObjects('a,b\n1,2\n\n3,4\n');
  assert.equal(rows.length, 2);
});
