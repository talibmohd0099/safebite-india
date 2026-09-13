// src/services/ingredientParser.test.js
//
// Run with: node --test src/services/ingredientParser.test.js
// (or `npm test`, which runs every *.test.js file under src/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredients } from './ingredientParser.js';

function byName(ingredients, name) {
  return ingredients.find((i) => i.displayName === name);
}

test('extracts ingredients nested inside a group that is followed by its own percentage bracket', () => {
  // Regression test for a real scanned label (Slurp Farm Millet Noodles):
  // "Supergrain blend (whole wheat (atta), jowar) (63%)" — the comma-
  // separated ingredient list sits in the MIDDLE bracket, with a
  // trailing percentage-only bracket after it. The parser used to only
  // look at the LAST top-level bracket to decide whether to recurse into
  // a sub-ingredient list; since the last bracket here is "(63%)" (no
  // comma), it never recursed, mangled the whole clause into one
  // unnamed blob, and silently dropped it entirely -- atta and jowar,
  // the two largest ingredients in the product, never reached scoring.
  const label =
    'Noodles (88.5%): Supergarn blend (whole wheat (atta), jowar) (63%), ' +
    'guar gum, iodised salt, rosemary (antioxidant) [INS 392]. ' +
    'Seasoning (11.5%): Mixed spices (onion, coriander, chilli), ' +
    'tapioca starch, citric acid (acidity regulator) [INS 330].';

  const result = parseIngredients(label);

  const atta = byName(result, 'Whole Wheat Atta');
  const jowar = byName(result, 'Jowar');
  assert.ok(atta, 'whole wheat (atta) must be extracted as its own ingredient');
  assert.ok(jowar, 'jowar must be extracted as its own ingredient');

  // The trailing "(63%)" belongs to this two-member group, split evenly.
  assert.equal(atta.percentage, 31.5);
  assert.equal(jowar.percentage, 31.5);
  // Both share one slot -- they came out of the same bracket.
  assert.equal(atta.groupId, jowar.groupId);
  assert.ok(atta.groupId);

  // Siblings outside that bracket ("guar gum", "iodised salt", ...) are
  // unaffected and still parse as their own, ungrouped ingredients.
  assert.ok(byName(result, 'Guar Gum'));
  assert.ok(byName(result, 'Iodised Salt'));
});

test('picks the percentage bracket nearest to the group it belongs to, not the first one in the string', () => {
  // "Noodles (88.5%)" is an unrelated OUTER percentage that happens to
  // appear earlier in the string than the "(63%)" that actually
  // describes the supergrain blend. Grabbing whichever percentage
  // bracket appears first would silently attribute the wrong number.
  const label = 'Noodles (88.5%): Supergarn blend (whole wheat (atta), jowar) (63%).';
  const result = parseIngredients(label);

  const atta = byName(result, 'Whole Wheat Atta');
  const jowar = byName(result, 'Jowar');
  assert.equal(atta.percentage, 31.5);
  assert.equal(jowar.percentage, 31.5);
});

test('still distributes a wrapper percentage across a simple sub-ingredient list', () => {
  // "Seasoning (11.5%): Mixed spices (a, b, c, d, e)" — this case already
  // recursed correctly before the fix (its own comma-bearing bracket was
  // the last one), but the wrapper's "11.5%" was previously discarded
  // instead of being shared across the five spices.
  const label = 'Seasoning (11.5%): Mixed spices (onion, coriander, chilli, turmeric, garlic).';
  const result = parseIngredients(label);

  for (const name of ['Onion', 'Coriander', 'Chilli', 'Turmeric', 'Garlic']) {
    const ing = byName(result, name);
    assert.ok(ing, `${name} should be extracted`);
    assert.equal(ing.percentage, 11.5 / 5);
  }
});

test('a child that states its own percentage keeps it instead of the group average', () => {
  const label = 'Blend (Sugar 20%, Salt) (30%).';
  const result = parseIngredients(label);

  const sugar = byName(result, 'Sugar');
  const salt = byName(result, 'Salt');
  assert.equal(sugar.percentage, 20); // its own stated value, not 15 (30/2)
  assert.equal(salt.percentage, 15); // falls back to the even split
});

test('does not regress a bracketed ingredient list with no trailing percentage', () => {
  const label = 'Edible Vegetable Oil (Ricebran, Cottonseed, Palmolein)';
  const result = parseIngredients(label);

  for (const name of ['Ricebran', 'Cottonseed', 'Palmolein']) {
    const ing = byName(result, name);
    assert.ok(ing, `${name} should be extracted`);
    assert.equal(ing.percentage, null);
  }
});

test('does not regress a bracketed additive code list', () => {
  const label = 'RAISING AGENTS [INS 503(ii), 500(ii)]';
  const result = parseIngredients(label);
  assert.equal(result.length, 2);
  assert.ok(result.every((i) => i.insCode));
});

test('does not regress a single aliased ingredient', () => {
  const label = 'Refined Wheat Flour (Maida)';
  const result = parseIngredients(label);
  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, 'Refined Wheat Flour Maida');
});
