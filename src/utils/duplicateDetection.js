// src/utils/duplicateDetection.js
//
// Groups the catalog into "these are probably the same product" sets
// for the admin panel's Duplicates tool -- pure logic, no network, so
// the page just fetches once and groups client-side.
//
// Deliberately groups by brand + a normalized name signature that
// strips pack SIZE (500g, 1kg, 200ml, "pack of 2") rather than treating
// size as part of identity: different pack sizes of the same product
// are exactly the case this tool exists for (see the real Coca-Cola
// "Soft Drink" vs "Cola Soft Drink" near-duplicate found this session).

const FILLER_WORDS = new Set([
  'the', 'with', 'and', 'of', 'pack', 'combo', 'new', 'fresh', 'original', 'flavour', 'flavor', 'a', 'x',
]);
const SIZE_RE = /\b\d+(\.\d+)?\s*(kgs?|gms?|g|ml|ltrs?|l|litres?|liters?|pcs?|pieces?)\b/gi;
const PACK_OF_RE = /\bpack\s*of\s*\d+\b/gi;

/**
 * A signature built from the SET of a name's real identity words, not
 * their order or count -- "Coca-Cola Soft Drink" and "Coca-Cola Cola
 * Soft Drink" (a real near-duplicate pair found this session) differ
 * only by one repeated word, which an order/count-preserving signature
 * would never collapse together.
 */
export function normalizeSignature(name) {
  if (!name) return '';
  let s = name.toLowerCase();
  s = s.replace(PACK_OF_RE, ' ');
  s = s.replace(SIZE_RE, ' ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ').filter((w) => w && !FILLER_WORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].sort().join(' ');
}

/**
 * @param {{id, productName, brand}[]} products
 * @returns {Array[]} groups of 2+ products sharing a brand+signature
 */
export function groupPossibleDuplicates(products) {
  const groups = new Map();
  for (const p of products) {
    const sig = normalizeSignature(p.productName);
    if (!sig) continue;
    const brandKey = (p.brand || '').trim().toLowerCase();
    const key = `${brandKey}|${sig}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
