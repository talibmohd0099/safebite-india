import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasValidChecksum } from './barcodeChecksum.js';

test('accepts a real EAN-13 barcode with a correct check digit', () => {
  assert.equal(hasValidChecksum('4006381333931', 'ean_13'), true);
});

test('accepts a real EAN-8 barcode with a correct check digit', () => {
  assert.equal(hasValidChecksum('96385074', 'ean_8'), true);
});

test('accepts a real UPC-A barcode with a correct check digit', () => {
  assert.equal(hasValidChecksum('036000291452', 'upc_a'), true);
});

test('rejects a single misread digit in an otherwise-real EAN-13 (the actual failure mode from blur/low light)', () => {
  // Same Nutella barcode as above with one digit corrupted, exactly what a
  // blurry/low-light camera frame can produce.
  assert.equal(hasValidChecksum('4006381333921', 'ean_13'), false);
});

test('rejects a corrupted EAN-8', () => {
  assert.equal(hasValidChecksum('96385071', 'ean_8'), false);
});

test('rejects a corrupted UPC-A', () => {
  assert.equal(hasValidChecksum('036000291455', 'upc_a'), false);
});

test('does not checksum-validate UPC-E -- always passes through', () => {
  // UPC-E is a compressed 6-digit encoding; expanding it to validate isn't
  // worth it for a format that essentially never appears on Indian packs.
  assert.equal(hasValidChecksum('01234565', 'upc_e'), true);
});

test("a non-numeric rawValue (shouldn't happen for these formats, but stay safe) passes through rather than crashing", () => {
  assert.equal(hasValidChecksum('ABC123', 'ean_13'), true);
});
