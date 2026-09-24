import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSugarProjection, accumulateSugar, GRAMS_PER_TEASPOON } from './sugarProjection.js';

const base = {
  productName: 'Frooti Fresh Mango Drink',
  foodType: 'beverage',
  realNutrientsServingGrams: 200,
  realNutrientsServingUnit: 'ml',
};

test('per-serving sugar is computed from per-100 and the REAL serving size', () => {
  const p = buildSugarProjection({ ...base, nutrientsPer100: { addedSugarG: 14, totalSugarG: 15 } });
  assert.equal(p.gramsPerServing, 28); // 14g/100ml x 200ml
  assert.equal(p.teaspoonsPerServing, 7); // 28g / 4g
  assert.equal(p.servingUnit, 'ml');
  assert.equal(p.isAddedSugar, true);
});

test('no real serving size -> nothing shown (never falls back to a per-100g "serving")', () => {
  const p = buildSugarProjection({ ...base, realNutrientsServingGrams: null, nutrientsPer100: { addedSugarG: 14 } });
  assert.equal(p, null);
});

test('condiments, supplements, oils and infant food are skipped', () => {
  for (const foodType of ['condiment', 'supplement', 'oil-fat', 'infant']) {
    assert.equal(buildSugarProjection({ ...base, foodType, nutrientsPer100: { addedSugarG: 30 } }), null, foodType);
  }
  assert.equal(buildSugarProjection({ ...base, isCondimentOrSeasoning: true, nutrientsPer100: { addedSugarG: 30 } }), null);
});

test('under one teaspoon per serving is not worth a card', () => {
  // 1.5g/100ml x 200ml = 3g < 4g
  assert.equal(buildSugarProjection({ ...base, nutrientsPer100: { addedSugarG: 1.5, totalSugarG: 2 } }), null);
});

test('plain dairy with no added/total split is skipped -- could be all natural lactose', () => {
  const milk = { productName: 'Amul Taaza Toned Milk', foodType: 'dairy', realNutrientsServingGrams: 200, realNutrientsServingUnit: 'ml' };
  assert.equal(buildSugarProjection({ ...milk, nutrientsPer100: { addedSugarG: 4.8 } }), null);
});

test('flavoured dairy WITH a real added-sugar split is still shown', () => {
  const shake = { productName: 'Amul Kool Kesar Milk', foodType: 'dairy', realNutrientsServingGrams: 180, realNutrientsServingUnit: 'ml' };
  const p = buildSugarProjection({ ...shake, nutrientsPer100: { addedSugarG: 7, totalSugarG: 11.5 } });
  assert.equal(p.gramsPerServing, 12.6);
  assert.equal(p.isAddedSugar, true);
});

test('"100%"/"no added sugar" names with no split are skipped -- that sugar is the fruit\'s own', () => {
  for (const productName of ['Real 100% Orange Juice', 'Paper Boat Coconut Water No Added Sugar', 'Unsweetened Almond Drink']) {
    assert.equal(buildSugarProjection({ ...base, productName, nutrientsPer100: { addedSugarG: 10 } }), null, productName);
  }
});

test('without a split, a normal sweetened product is still shown -- just not called "added" sugar', () => {
  const p = buildSugarProjection({ ...base, nutrientsPer100: { addedSugarG: 12 } });
  assert.equal(p.gramsPerServing, 24);
  assert.equal(p.isAddedSugar, false);
});

test('no split: a savory item with a little of its own sugar is skipped (needs 2+ tsp)', () => {
  // A ready-to-eat biryani pack: 2.8g/100g x 250g = 7g, no split.
  const biryani = { productName: 'OK Hyderabadi Veg Biriyani', foodType: 'ready-meal', realNutrientsServingGrams: 250 };
  assert.equal(buildSugarProjection({ ...biryani, nutrientsPer100: { addedSugarG: 2.8 } }), null);
  // ...but the same 7g IS shown when the label says it's added sugar.
  const p = buildSugarProjection({ ...biryani, nutrientsPer100: { addedSugarG: 2.8, totalSugarG: 4 } });
  assert.equal(p.gramsPerServing, 7);
});

test('a "serving" of exactly 100 is treated as the per-100 basis, not a real serving', () => {
  // Real catalog case: Oreo recorded with a 100g "serving" -> 9.7 tsp, vs ~3 biscuits really.
  const oreo = { productName: 'Oreo Original', foodType: 'sweet-snack', realNutrientsServingGrams: 100 };
  assert.equal(buildSugarProjection({ ...oreo, nutrientsPer100: { addedSugarG: 38.8, totalSugarG: 39 } }), null);
  // The same product with its real ~33g serving is shown.
  const p = buildSugarProjection({ ...oreo, realNutrientsServingGrams: 33, nutrientsPer100: { addedSugarG: 38.8, totalSugarG: 39 } });
  assert.equal(p.gramsPerServing, 12.8);
});

test('a whole-pack weight recorded as the "serving" is rejected, per food type', () => {
  // Real live cases: family packs whose pack weight became the serving.
  const cases = [
    { productName: 'HIDE & SEEK Choco Chip Creme Sandwiches', foodType: 'other', realNutrientsServingGrams: 400 },
    { productName: 'Marie biscuits', foodType: 'sweet-snack', realNutrientsServingGrams: 300 },
    { productName: 'Southern Classic Bread', foodType: 'staple', realNutrientsServingGrams: 400 },
  ];
  for (const c of cases) {
    assert.equal(buildSugarProjection({ ...c, nutrientsPer100: { addedSugarG: 30, totalSugarG: 32 } }), null, c.productName);
  }
});

test('a genuinely single-serve large pack is kept (ready meal, juice bottle)', () => {
  const pasta = { productName: 'Tata Q Saucy Tomato Pasta', foodType: 'ready-meal', realNutrientsServingGrams: 305 };
  assert.ok(buildSugarProjection({ ...pasta, nutrientsPer100: { addedSugarG: 3.8, totalSugarG: 5 } }));
  const juice = { productName: 'Pokka Carrot Fruit Juice', foodType: 'beverage', realNutrientsServingGrams: 300, realNutrientsServingUnit: 'ml' };
  assert.ok(buildSugarProjection({ ...juice, nutrientsPer100: { addedSugarG: 9.9, totalSugarG: 11 } }));
});

test('powders/mixes/soups are skipped -- the pack is several servings once made up', () => {
  const knorr = { productName: 'Knorr International Mexican Tomato Corn Soup', foodType: 'ready-meal', realNutrientsServingGrams: 163 };
  assert.equal(buildSugarProjection({ ...knorr, nutrientsPer100: { addedSugarG: 28, totalSugarG: 30 } }), null);
  // "mixed"/"mixture" are not "mix"
  const juice = { productName: 'Real Mixed Fruit Juice', foodType: 'beverage', realNutrientsServingGrams: 200, realNutrientsServingUnit: 'ml' };
  assert.ok(buildSugarProjection({ ...juice, nutrientsPer100: { addedSugarG: 12, totalSugarG: 13 } }));
});

test('a drink with an impossible sugar density is skipped (per-bottle figure saved as per-100)', () => {
  const mogu = { productName: 'Mogu Mogu Pineapple Fruit Drink', foodType: 'beverage', realNutrientsServingGrams: 320, realNutrientsServingUnit: 'ml' };
  assert.equal(buildSugarProjection({ ...mogu, nutrientsPer100: { addedSugarG: 32, totalSugarG: 33 } }), null);
});

test('an added-sugar figure of 0 (with a split) shows nothing', () => {
  assert.equal(buildSugarProjection({ ...base, nutrientsPer100: { addedSugarG: 0, totalSugarG: 9 } }), null);
});

test('accumulateSugar is plain multiplication: week, 30-day month, 52-week year', () => {
  const daily = accumulateSugar(28, 7);
  assert.equal(daily.week.grams, 196);
  assert.equal(daily.month.grams, 840);
  assert.equal(daily.year.grams, 10192);
  assert.equal(daily.year.kg, 10.2);
  assert.equal(daily.year.teaspoons, Math.round(10192 / GRAMS_PER_TEASPOON));

  const weekly = accumulateSugar(28, 1);
  assert.equal(weekly.year.grams, 1456);
});
