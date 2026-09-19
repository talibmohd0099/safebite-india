// src/services/barcodeChecksum.js
// A single blurry or low-light camera frame can make BarcodeScanner.jsx's
// BarcodeDetector read one digit wrong. EAN-13/EAN-8/UPC-A carry a GS1
// check digit specifically so a corrupted read can be caught, so the
// scanner rejects anything that fails this instead of trusting the first
// thing the camera reports.
const CHECKSUM_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a']);

export function hasValidChecksum(rawValue, format) {
  if (!CHECKSUM_FORMATS.has(format) || !/^\d+$/.test(rawValue)) return true;
  const digits = rawValue.split('').map(Number);
  const checkDigit = digits.pop();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const weight = (digits.length - i) % 2 === 0 ? 1 : 3;
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10 === checkDigit;
}
