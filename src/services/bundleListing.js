// src/services/bundleListing.js
//
// Listings that are a BUNDLE, not one product: gift packs and hampers,
// potlis, variety packs, samplers, combos. A bundle has one ingredients
// field (often just "Mix Dry Fruits" or one item's list) that can't
// describe everything in the box, so any score for it is meaningless --
// Farmley "Mix Dry Fruit Potli Gift Pack" scored 100 on the single
// ingredient "Mix Dry Fruits". These are skipped at scrape/report time and
// swept out of the catalog with scripts/remove-bundle-listings.js.
//
// Deliberately NOT caught:
//  - "Pack of 2/3": the same product repeated -- its score is still right.
//  - "combo" as marketing on one product ("Orange Juice Combo With Pulp").
//  - "Assorted" on its own: usually flavours of ONE product (an "Assorted
//    Flavours" electrolyte or protein bar) -- an assorted GIFT PACK is still
//    caught by the gift rule.
//  - "A + B" where both sides are just nutrition words ("Fruits + Nuts &
//    Seeds Muesli", "Hydration + Energy"): that's one formulation.
const BUNDLE_PATTERNS = [
  / \+ /, // "A + B" -- Blinkit's own joiner for bundles
  /\bgift\s*(pack|packs|box|boxes|hamper|set|combo)?\b/i,
  /\bhampers?\b/i,
  /\bpotli\b/i,
  /\bvariety\s+(pack|box|set)\b/i,
  /\bsampler\b/i,
  /\bcombo\b(?!\s+with\s+pulp)/i,
];

const NUTRITION_PLUS =
  /\b(fruits?|nuts?|seeds?|hydration|energy|protein|fibre|fiber|vitamins?|iron|calcium|probiotics?|omega|muesli)\s*\+\s*(fruits?|nuts?|seeds?|hydration|energy|protein|fibre|fiber|vitamins?|iron|calcium|probiotics?|omega|muesli)\b/i;

export function isBundleListing(productName) {
  const name = String(productName || '');
  // Take away a "Fruits + Nuts"-style phrase before testing, so it can't
  // trip the " + " rule -- anything else in the name still counts.
  const cleaned = name.replace(NUTRITION_PLUS, ' ');
  return BUNDLE_PATTERNS.some((re) => re.test(cleaned));
}
