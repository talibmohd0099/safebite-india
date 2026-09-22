import test from 'node:test';
import assert from 'node:assert/strict';
import { isBundleListing } from './bundleListing.js';

test('gift packs, hampers, potlis, assorted packs and multi-packs are bundles (real catalog names)', () => {
  for (const name of [
    'Farmley Mix Dry Fruit Potli Gift Pack',
    'May & Co. Gift Pack',
    'Cremica Butter Biscuits Gift Pack',
    "McVitie's Festivities Assorted Biscuits Gift Pack",
    'Snackstar Imported Snacks Gift Hamper (Small)',
    'Haldiram\'s Meetha Teekha Gift Pack',
    'Indian Mirrch Co. Gravy Masala Combo',
    'Fruitaco Soy Sauce, Red & Green Chilli with Vinegar Combo',
    'Kwality Multigrain Chocos & Cereal Combo Pack - Pack of 2',
    'Mogu Mogu Lychee Fruit Drink +  Apple Juice With Nata De Coco Combo',
    // "Pack of N" -- own score would be correct (same product repeated),
    // skipped anyway: a duplicate catalog entry of the single-pack
    // listing, carrying a hero photo that's Blinkit's own multi-unit
    // staging choice rather than a plain reproduction of the pack's own
    // printed face.
    'Metro Malai Paneer - Pack of 2',
    'Kellogg\'s Almonds & Honey Corn Flakes - Pack of 2',
    'Farmley Classic Delight Dates Bites - No Added Sugar - Pack of 2',
    'Yoga Bar Fruits + Nuts & Seeds Super Muesli - Pack of 3',
  ]) assert.equal(isBundleListing(name), true, name);
});

test('single products are left alone, including "combo" marketing and "N in 1"', () => {
  for (const name of [
    'Nutripulp Orange Fruit Juice Combo With Pulp',
    'Kitty Golden Treats Brownie 8 in 1',
    'Salt & Pepper Peanuts',
    'Fortune Chakki Fresh Atta - 5kg',
    'Maggi 2-Minute Noodles',
    'Setu Hydration + Energy Electrolyte',
    'Muesli+ (Fruits + Nuts & Seeds)',
    'OPN Instant Hydration Electrolyte (Assorted Flavours)',
    'Fitspire Assorted Protein Bar',
    'Elvan Mini Assorted Chocolate Pack',
    'Choko La Hot Chocolate (Assorted Flavours)',
  ]) assert.equal(isBundleListing(name), false, name);
});

test('empty input is not a bundle', () => {
  assert.equal(isBundleListing(''), false);
  assert.equal(isBundleListing(null), false);
});
