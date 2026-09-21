// src/services/bundleListing.js
//
// Listings that are a BUNDLE, not one product: gift packs and hampers,
// potlis, assorted/variety packs, samplers, combos. A bundle has one
// ingredients field (often just "Mix Dry Fruits" or one item's list) that
// can't describe everything in the box, so any score for it is
// meaningless -- Farmley "Mix Dry Fruit Potli Gift Pack" scored 100 on the
// single ingredient "Mix Dry Fruits". These are skipped at scrape/report
// time and can be swept out of the catalog with scripts/remove-bundle-listings.js.
//
// Deliberately NOT caught: "Pack of 2/3" (the same product repeated -- its
// ingredients and score are still exactly right) and a single product that
// merely says "combo" as marketing ("Orange Juice Combo With Pulp").
const BUNDLE_PATTERNS = [
  / \+ /,                                        // "A + B" -- Blinkit's own joiner for bundles
  /\bgift\s*(pack|packs|box|boxes|hamper|set|combo)?\b/i,
  /\bhampers?\b/i,
  /\bpotli\b/i,
  /\bassorted\b/i,
  /\bvariety\s+(pack|box|set)\b/i,
  /\bsampler\b/i,
  /\bcombo\b(?!\s+with\s+pulp)/i,
];

export function isBundleListing(productName) {
  const name = String(productName || '');
  return BUNDLE_PATTERNS.some((re) => re.test(name));
}
