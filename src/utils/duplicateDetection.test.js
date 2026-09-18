// src/utils/duplicateDetection.test.js
//
// Run with: node --test src/utils/duplicateDetection.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSignature, groupPossibleDuplicates } from './duplicateDetection.js';

test('strips pack size so different sizes of the same product share a signature', () => {
  assert.equal(normalizeSignature('Fortune Chakki Fresh Atta 5kg'), normalizeSignature('Fortune Chakki Fresh Atta 1kg'));
});

test('strips "pack of N" the same way', () => {
  assert.equal(normalizeSignature('Maggi 2-Minute Noodles Pack of 4'), normalizeSignature('Maggi 2-Minute Noodles'));
});

test('the real near-duplicate found this session collapses to the same signature', () => {
  assert.equal(normalizeSignature('Coca-Cola Soft Drink'), normalizeSignature('Coca-Cola Cola Soft Drink'));
});

test('genuinely different products do not collapse together', () => {
  assert.notEqual(normalizeSignature('Coca-Cola Zero Sugar Soft Drink'), normalizeSignature('Coca-Cola Cherry Flavoured Soft Drink'));
});

test('groups only sets of 2 or more, keyed by brand + signature', () => {
  const groups = groupPossibleDuplicates([
    { id: 1, productName: 'Coca-Cola Soft Drink', brand: 'Coca-Cola' },
    { id: 2, productName: 'Coca-Cola Cola Soft Drink', brand: 'Coca-Cola' },
    { id: 3, productName: 'Thums Up Soft Drink', brand: 'Thums Up' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((p) => p.id).sort(), [1, 2]);
});

test('a different brand with the same name is not grouped as a duplicate', () => {
  const groups = groupPossibleDuplicates([
    { id: 1, productName: 'Chocolate Sandwich Cookies', brand: 'Sunfeast' },
    { id: 2, productName: 'Chocolate Sandwich Cookies', brand: 'Britannia' },
  ]);
  assert.equal(groups.length, 0);
});
