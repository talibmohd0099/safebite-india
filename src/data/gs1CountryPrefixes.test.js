// src/data/gs1CountryPrefixes.test.js
//
// Run with: node --test src/data/gs1CountryPrefixes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGs1Prefix } from './gs1CountryPrefixes.js';

test('890 resolves to India', () => {
  assert.deepEqual(resolveGs1Prefix('8901725010898'), { label: 'India', type: 'india' });
});

test('real examples found in this project\'s own catalog resolve to their real countries', () => {
  assert.equal(resolveGs1Prefix('7622202225512').label, 'Switzerland / Liechtenstein'); // Cadbury
  assert.equal(resolveGs1Prefix('8801073115118').label, 'South Korea'); // Samyang Ramen
  assert.equal(resolveGs1Prefix('8996001312506').label, 'Indonesia'); // Mayora Malkist
  assert.equal(resolveGs1Prefix('8886467122422').label, 'Singapore'); // Pringles
});

test('a Patanjali product (100% Indian brand) with a Japan-range prefix is flagged as "country", not silently accepted', () => {
  const result = resolveGs1Prefix('4906630019077');
  assert.equal(result.label, 'Japan');
  assert.equal(result.type, 'country');
});

test('the 200-299 block is GS1\'s own restricted-circulation range, not a real foreign country', () => {
  assert.equal(resolveGs1Prefix('2000000136641').type, 'restricted');
});

test('a UPC-A style 0-prefixed code resolves as US/Canada, not "unknown"', () => {
  assert.equal(resolveGs1Prefix('0890600200494').type, 'domestic-other');
});

test('a barcode too short to have a real prefix does not crash', () => {
  assert.equal(resolveGs1Prefix('12').type, 'unknown');
  assert.equal(resolveGs1Prefix('').type, 'unknown');
  assert.equal(resolveGs1Prefix(null).type, 'unknown');
});
