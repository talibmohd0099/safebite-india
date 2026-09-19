// src/services/allergenCenter.test.js
//
// Run with: node --test src/services/allergenCenter.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAllergens, detectCustomAllergens, getAllergenWarnings } from './allergenCenter.js';

// A real-shape Maggi Masala Noodles report: milk/soy/wheat present as
// real ingredients, no explicit "Contains" declaration line at all --
// the ingredient-name signal is the ONLY thing that can catch this,
// which is exactly the gap a "Contains"-declaration-only check would miss.
const MAGGI_NO_DECLARATION = {
  allergens: [],
  ingredients: [
    { name: 'Refined Wheat Flour (Maida)' },
    { name: 'Palm Oil' },
    { name: 'Milk Solids' },
    { name: 'Soya Lecithin (Emulsifier)' },
    { name: 'Iodised Salt' },
  ],
};

// A real-shape product WITH a declaration line, matching
// ingredientParser.js's own real-product regression test.
const WITH_DECLARATION = {
  allergens: [
    { word: 'nut', severity: 'contains' },
    { word: 'milk', severity: 'may_contain' },
    { word: 'soy', severity: 'may_contain' },
  ],
  ingredients: [
    { name: 'Refined Wheat Flour' },
    { name: 'Sugar' },
    { name: 'Palm Oil' },
  ],
};

test('detectAllergens catches an allergen named directly in the ingredient list, with no declaration at all', () => {
  const hits = detectAllergens(MAGGI_NO_DECLARATION, ['wheat', 'milk', 'soy', 'peanut']);
  const byCategory = Object.fromEntries(hits.map((h) => [h.category, h.severity]));
  assert.equal(byCategory.wheat, 'contains');
  assert.equal(byCategory.milk, 'contains');
  assert.equal(byCategory.soy, 'contains');
  assert.equal(byCategory.peanut, undefined); // genuinely not present
});

test('detectAllergens reads severity from a declared allergen line when there is no direct ingredient match', () => {
  const hits = detectAllergens(WITH_DECLARATION, ['treeNuts', 'milk', 'soy', 'egg']);
  const byCategory = Object.fromEntries(hits.map((h) => [h.category, h.severity]));
  assert.equal(byCategory.treeNuts, 'contains'); // "nut" declared as Contains
  assert.equal(byCategory.milk, 'may_contain');
  assert.equal(byCategory.soy, 'may_contain');
  assert.equal(byCategory.egg, undefined);
});

test('detectAllergens prefers "contains" when BOTH a direct ingredient match and a "may_contain" declaration exist', () => {
  const mixed = {
    allergens: [{ word: 'milk', severity: 'may_contain' }],
    ingredients: [{ name: 'Milk Solids' }], // also genuinely an ingredient
  };
  const [hit] = detectAllergens(mixed, ['milk']);
  assert.equal(hit.severity, 'contains');
});

test('detectAllergens groups gluten-bearing cereals under "wheat" -- a real product declaring "oats" should still warn a wheat-allergy profile', () => {
  const oatsDeclared = { allergens: [{ word: 'oats', severity: 'may_contain' }], ingredients: [] };
  const hits = detectAllergens(oatsDeclared, ['wheat']);
  assert.equal(hits[0]?.severity, 'may_contain');
});

test('detectAllergens catches "Groundnut" as peanut -- real gap found via a live Maggi Masala Noodles check', () => {
  // Real product, no "Contains" declaration at all: its actual
  // ingredient is "Hydrolysed Groundnut Protein" -- "groundnut" is the
  // common Indian-English name for peanut. The bare 'peanut'/'peanuts'
  // word list silently missed this exact real allergen until this was
  // added, caught by testing against real catalog data before shipping.
  const maggi = { allergens: [], ingredients: [{ name: 'Hydrolysed Groundnut Protein' }] };
  const [hit] = detectAllergens(maggi, ['peanut']);
  assert.equal(hit.severity, 'contains');
});

test('detectAllergens does not false-positive "peanut" on an unrelated word containing "nut"', () => {
  // "Coconut" contains the substring "nut" but is not a tree-nut allergen
  // -- the word-boundary match must not fire on it via the "nut" entry.
  const coconutProduct = { allergens: [], ingredients: [{ name: 'Desiccated Coconut' }] };
  const hits = detectAllergens(coconutProduct, ['treeNuts']);
  assert.deepEqual(hits, []);
});

test('detectCustomAllergens matches a free-text term the same way, case-insensitively', () => {
  const product = { allergens: [], ingredients: [{ name: 'Mustard Oil' }] };
  const hits = detectCustomAllergens(product, ['Mustard']);
  assert.equal(hits[0]?.category, 'Mustard');
  assert.equal(hits[0]?.severity, 'contains');
  assert.equal(hits[0]?.custom, true);
});

test('getAllergenWarnings checks every profile regardless of which one is "active" -- a hard safety property, not a preference', () => {
  const ibbu = { id: 'ibbu', nickname: 'Ibbu', allergies: ['peanut'], customAllergies: [] };
  const talib = { id: 'talib', nickname: 'Talib', allergies: ['milk'], customAllergies: [] };
  const product = {
    allergens: [],
    ingredients: [{ name: 'Peanut Butter' }, { name: 'Milk Solids' }],
  };
  const warnings = getAllergenWarnings(product, [ibbu, talib]);
  const byCategory = Object.fromEntries(warnings.map((w) => [w.category, w]));
  assert.equal(byCategory.peanut.profiles[0].nickname, 'Ibbu');
  assert.equal(byCategory.milk.profiles[0].nickname, 'Talib');
});

test('getAllergenWarnings merges the same category across two profiles into one warning naming both', () => {
  const ibbu = { id: 'ibbu', nickname: 'Ibbu', allergies: ['milk'], customAllergies: [] };
  const talib = { id: 'talib', nickname: 'Talib', allergies: ['milk'], customAllergies: [] };
  const product = { allergens: [], ingredients: [{ name: 'Milk Solids' }] };
  const warnings = getAllergenWarnings(product, [ibbu, talib]);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0].profiles.map((p) => p.nickname).sort(), ['Ibbu', 'Talib']);
});

test('getAllergenWarnings sorts "contains" before "may_contain"', () => {
  const ibbu = { id: 'ibbu', nickname: 'Ibbu', allergies: ['milk'], customAllergies: [] };
  const talib = { id: 'talib', nickname: 'Talib', allergies: ['soy'], customAllergies: [] };
  const product = {
    allergens: [{ word: 'soy', severity: 'may_contain' }],
    ingredients: [{ name: 'Milk Solids' }],
  };
  const warnings = getAllergenWarnings(product, [ibbu, talib]);
  assert.equal(warnings[0].category, 'milk');
  assert.equal(warnings[0].severity, 'contains');
  assert.equal(warnings[1].category, 'soy');
  assert.equal(warnings[1].severity, 'may_contain');
});

test('getAllergenWarnings returns nothing for a profile with no allergies set, or a clean product', () => {
  const noAllergies = { id: 'x', nickname: 'X', allergies: [], customAllergies: [] };
  const product = { allergens: [], ingredients: [{ name: 'Milk Solids' }] };
  assert.deepEqual(getAllergenWarnings(product, [noAllergies]), []);

  const hasMilkAllergy = { id: 'y', nickname: 'Y', allergies: ['milk'], customAllergies: [] };
  const cleanProduct = { allergens: [], ingredients: [{ name: 'Refined Wheat Flour' }, { name: 'Sugar' }] };
  assert.deepEqual(getAllergenWarnings(cleanProduct, [hasMilkAllergy]), []);
});
