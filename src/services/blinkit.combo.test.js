// src/services/blinkit.combo.test.js
//
// Checks the real isComboListing() export (blinkit.js), used by
// scrapeProduct() to skip combo listings -- against real product
// names pulled from the actual catalog while investigating this, not
// invented examples, so this stays honest about what the pattern does
// and doesn't catch.
//
// Run with: node --test src/services/blinkit.combo.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isComboListing } from './blinkit.js';

test('real confirmed multi-item combos (different products bundled) are caught', () => {
  const names = [
    'The Select Aisle Drinking Hot Chocolate +  Mini Marshmallow - Vegan x 3 Combo',
    'Slurrp Farm Banana Oat Cookies x 2 +  Milky Choco Chip Cookies Combo',
    'habanero Habanero Jalapeno Cheese Dip + Habanero Zingy Jalapeno Nachos Combo',
    'MasterChow Thai Rice Noodles +  Chowmein Sauce Combo',
    'Bingo Cheese Nachos with Free Dip +  Chilli Limon Nachos with Free Dip Combo',
    'Britannia Toastea Premium Bake Rusk (250 g) + Britannia NutriChoice 5 Grain Digestive Biscuit Combo',
    "Ching's Secret Schezwan Chutney + Ching's Secret Veg Hakka Noodles with Masala",
    'MasterChow Red Chilli Sauce + Green Chilli Sauce Combo',
  ];
  for (const name of names) assert.equal(isComboListing(name), true, name);
});

test('a real single product that merely uses "combo" as marketing is NOT caught (no false positive)', () => {
  // Real catalog example: this is one juice, not two bundled products
  // -- ingredients_text is just "Orange Juice (80%), Orange Pulp (20%)".
  assert.equal(isComboListing('Nutripulp Orange Fruit Juice Combo With Pulp'), false);
});

test('ordinary product names with a hyphen or ampersand (not " + ") are left alone', () => {
  assert.equal(isComboListing('Lay\'s Chile Limon Flavour Potato Chips'), false);
  assert.equal(isComboListing('Salt & Pepper Peanuts'), false);
  assert.equal(isComboListing('Fortune Chakki Fresh Atta - 5kg'), false);
});
