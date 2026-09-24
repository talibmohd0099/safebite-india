import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNutrientProjections, accumulate, SALT_PER_SODIUM } from './nutrientProjection.js';

const noodles = {
  productName: 'Maggi 2-Minute Masala Noodles',
  foodType: 'ready-meal',
  realNutrientsServingGrams: 70,
  nutrientsPer100: { sodiumMg: 1200, totalFatG: 15, saturatedFatG: 7, addedSugarG: 1.5, totalSugarG: 2 },
};

test('more than one concern: noodles return BOTH salt and fat, most concerning first', () => {
  const r = buildNutrientProjections(noodles);
  assert.deepEqual(r.items.map((i) => i.key), ['salt', 'fat']); // sugar 1g < 1 tsp -> not shown
  const salt = r.items[0];
  assert.equal(salt.gramsPerServing, 2.1); // 1200mg x 2.5 = 3g/100g x 70g
  assert.equal(salt.percentOfDailyLimit, 42); // of WHO's 5g
  const fat = r.items[1];
  assert.equal(fat.gramsPerServing, 10.5);
  assert.equal(fat.teaspoonsPerServing, 2.3); // 10.5 / 4.5
  assert.equal(fat.saturatedGramsPerServing, 4.9);
});

test('a cream biscuit returns sugar AND fat -- ranked by share of WHO reference amounts', () => {
  const r = buildNutrientProjections({
    productName: 'Sunfeast Dark Fantasy Choco Fills Cookies',
    foodType: 'sweet-snack',
    realNutrientsServingGrams: 30,
    nutrientsPer100: { addedSugarG: 35, totalSugarG: 36, totalFatG: 25, sodiumMg: 300 },
  });
  const keys = r.items.map((i) => i.key);
  assert.ok(keys.includes('sugar') && keys.includes('fat'));
  assert.equal(keys[0], 'sugar'); // 10.5g/50 = 0.21 beats 7.5g/70 = 0.11
  assert.ok(!keys.includes('salt')); // 0.2g salt, under the bar
});

test('every item describes the SAME serving', () => {
  const r = buildNutrientProjections(noodles);
  assert.equal(r.serving.grams, 70);
  assert.equal(r.serving.source, 'label');
});

test('salt/masala/pickle products get no salt card (used a pinch at a time)', () => {
  for (const productName of ['Tata Salt Iodised', 'Everest Garam Masala', 'Mother\'s Recipe Mango Pickle']) {
    const r = buildNutrientProjections({ productName, foodType: 'staple', realNutrientsServingGrams: 30, nutrientsPer100: { sodiumMg: 4000 } });
    assert.ok(!r || !r.items.some((i) => i.key === 'salt'), productName);
  }
});

test('"salted" snacks and "salt caramel" popcorn are still ordinary food', () => {
  const r = buildNutrientProjections({ productName: 'Himalayan Salt Caramel Popcorn', foodType: 'fried-snack', realNutrientsServingGrams: 30, nutrientsPer100: { sodiumMg: 900, totalFatG: 20 } });
  assert.ok(r.items.some((i) => i.key === 'salt'));
});

test('nuts/seeds get no fat card -- mostly unsaturated fat', () => {
  const r = buildNutrientProjections({ productName: 'Happilo Almonds', foodType: 'nuts-seeds', realNutrientsServingGrams: 30, nutrientsPer100: { totalFatG: 50 } });
  assert.equal(r, null);
});

test('impossible values are data errors, not shown', () => {
  const r = buildNutrientProjections({ productName: 'Some Chips', foodType: 'fried-snack', realNutrientsServingGrams: 30, nutrientsPer100: { sodiumMg: 90000, totalFatG: 140 } });
  assert.equal(r, null);
});

test('condiments / oils / powders show nothing at all', () => {
  assert.equal(buildNutrientProjections({ productName: 'Kissan Ketchup', foodType: 'condiment', nutrientsPer100: { addedSugarG: 25, sodiumMg: 1000 } }), null);
  assert.equal(buildNutrientProjections({ productName: 'Fortune Sunflower Oil', foodType: 'oil-fat', nutrientsPer100: { totalFatG: 100 } }), null);
  assert.equal(buildNutrientProjections({ productName: 'Knorr Tomato Soup', foodType: 'ready-meal', realNutrientsServingGrams: 53, nutrientsPer100: { sodiumMg: 4000 } }), null);
});

test('accumulate: salt in 1 kg packets, fat in 1-litre oil packs', () => {
  const salt = accumulate('salt', 2.1, 7);
  assert.equal(salt.year.grams, Math.round(2.1 * 7 * 52));
  assert.equal(salt.year.packs, 0.8);
  const fat = accumulate('fat', 10.5, 7);
  assert.equal(fat.year.packs, 4.2); // 3822g / 910g per litre
  assert.equal(SALT_PER_SODIUM, 2.5);
});

test('real catalog cases that must not read as one serving / must not show', () => {
  // 200g butter tagged dairy -> no fat card (butter by name)
  const butter = buildNutrientProjections({ productName: 'Milk & Meadows A2 White Butter', foodType: 'dairy', packSize: '200 g', nutrientsPer100: { totalFatG: 73 } });
  assert.ok(!butter || !butter.items.some((i) => i.key === 'fat'));
  // 200g cheese block -> typical 25g, not the block
  const cheese = buildNutrientProjections({ productName: 'Mooz Cheddar Cheese Block', foodType: 'dairy', packSize: '200 g', nutrientsPer100: { totalFatG: 29, sodiumMg: 700 } });
  assert.equal(cheese.serving.grams, 25);
  // 360g frozen nuggets -> typical 85g
  const nuggets = buildNutrientProjections({ productName: 'Total Crispy Chicken Nuggets', foodType: 'ready-meal', packSize: '360 g', nutrientsPer100: { totalFatG: 17, sodiumMg: 600 } });
  assert.equal(nuggets.serving.grams, 85);
  // 180g "Teacake" -> cake, 40g
  const teacake = buildNutrientProjections({ productName: 'CakeZone Mawa Teacake', foodType: 'ready-meal', packSize: '180 g', nutrientsPer100: { totalFatG: 35, addedSugarG: 30, totalSugarG: 31 } });
  assert.equal(teacake.serving.grams, 40);
  // data errors: kulfi at 4,750mg sodium/100g, tonic water at 2,100mg/100ml
  const kulfi = buildNutrientProjections({ productName: 'Kwality Walls Desi Twist Kulfi', foodType: 'dairy', realNutrientsServingGrams: 58, nutrientsPer100: { sodiumMg: 4750 } });
  assert.ok(!kulfi || !kulfi.items.some((i) => i.key === 'salt'));
  const tonic = buildNutrientProjections({ productName: 'Tipsy Tiger Premium Tonic Water', foodType: 'beverage', packSize: '250 ml', nutrientsPer100: { sodiumMg: 2144 } });
  assert.ok(!tonic || !tonic.items.some((i) => i.key === 'salt'));
});

test('"Butter Cookies" is still a biscuit (20g), not cheese', () => {
  const r = buildNutrientProjections({ productName: 'Bakemate Butter Cookies', foodType: 'sweet-snack', nutrientsPer100: { totalFatG: 28, addedSugarG: 25, totalSugarG: 26 } });
  assert.equal(r.serving.grams, 20);
});

test('more live cases: ingredients, herbal tea, powders-as-drinks, multi-packs', () => {
  const none = (r, key) => !r || !r.items.some((i) => i.key === key);
  assert.ok(none(buildNutrientProjections({ productName: 'Pluckk Frozen Grated Coconut', foodType: 'ready-meal', packSize: '200 g', nutrientsPer100: { totalFatG: 38 } }), 'fat'));
  assert.ok(none(buildNutrientProjections({ productName: "D'lecta Dairy Fresh Cream - 25% Fat", foodType: 'dairy', packSize: '200 ml', nutrientsPer100: { totalFatG: 25 } }), 'fat'));
  assert.equal(buildNutrientProjections({ productName: 'Herbea Digestea Herbal Infusion', foodType: 'beverage', nutrientsPer100: { totalFatG: 30 } }), null);
  assert.ok(none(buildNutrientProjections({ productName: 'Nestle NANGROW Milk Drink Creamy Vanilla', foodType: 'dairy', nutrientsPer100: { totalFatG: 19, addedSugarG: 5, totalSugarG: 20 } }), 'fat'));
  assert.ok(none(buildNutrientProjections({ productName: 'Harajuku Castella Vanilla Teacake', foodType: 'sweet-snack', nutrientsPer100: { totalFatG: 80 } }), 'fat'));
  // multi-packs / pack weights -> typical serving
  assert.equal(buildNutrientProjections({ productName: 'Maggi Veggie Masala Instant Noodles', foodType: 'ready-meal', packSize: '248 g', nutrientsPer100: { sodiumMg: 1130, totalFatG: 13.5 } }).serving.grams, 70);
  assert.equal(buildNutrientProjections({ productName: 'Smoor Multigrain Burger Bun', foodType: 'baked-snack', packSize: '150 g', nutrientsPer100: { totalFatG: 22 } }).serving.grams, 50);
  const sev = buildNutrientProjections({ productName: "Chheda's Nylon Sev Bhujia", foodType: 'fried-snack', realNutrientsServingGrams: 90, nutrientsPer100: { totalFatG: 49, sodiumMg: 700 } });
  assert.equal(sev.serving.grams, 30); // 90g "serving" rejected -> typical namkeen
});
