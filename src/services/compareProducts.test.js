// src/services/compareProducts.test.js
//
// Run with: node --test src/services/compareProducts.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparisonRows, describeDifferences, personalFitLabels } from './compareProducts.js';

// Three real-shape instant noodle products, numbers in the plausible
// real range for this category (Maggi's own label lists sodium in the
// 1000-1200mg/100g range; the other two are constructed to have a real,
// describable spread against it without inventing an unrealistic product).
const MAGGI = {
  lookupKey: 'barcode:maggi',
  productName: 'Maggi 2 Minute Noodles Masala',
  brand: 'Nestle',
  overallScore: 48,
  realNutrients: { energyKcal: 457, proteinG: 9.5, totalCarbG: 60.3, addedSugarG: 6.1, totalFatG: 17.2, saturatedFatG: 7.9, sodiumMg: 890 },
  ingredients: [
    { name: 'Palm Oil', insCode: null, category: 'oil', status: 'concerning' },
    { name: 'Wheat Flour', insCode: null, category: 'natural', status: 'safe' },
    { name: 'Flavour Enhancer', insCode: '635', category: 'flavour', status: 'concerning' },
    { name: 'Acidity Regulator', insCode: '501', category: 'acidity regulator', status: 'safe' },
    { name: 'Palm Oil Blend', insCode: null, category: 'oil', status: 'concerning' },
  ],
};

const YIPPEE = {
  lookupKey: 'barcode:yippee',
  productName: 'Sunfeast Yippee Noodles Magic Masala',
  brand: 'Sunfeast',
  overallScore: 61,
  realNutrients: { energyKcal: 430, proteinG: 8.2, totalCarbG: 62.1, addedSugarG: 4.2, totalFatG: 15.1, saturatedFatG: 6.8, sodiumMg: 620 },
  ingredients: [
    { name: 'Wheat Flour', insCode: null, category: 'natural', status: 'safe' },
    { name: 'Salt', insCode: null, category: 'other', status: 'safe' },
  ],
};

const TOP_RAMEN = {
  lookupKey: 'barcode:topramen',
  productName: 'Top Ramen Masala Noodles',
  brand: 'Nissin',
  overallScore: 58,
  realNutrients: { energyKcal: 444, proteinG: 9.1, totalCarbG: 61.0, addedSugarG: 4.8, totalFatG: 16.8, saturatedFatG: 7.1, sodiumMg: 720 },
  ingredients: [
    { name: 'Wheat Flour', insCode: null, category: 'natural', status: 'safe' },
    { name: 'Flavour Enhancer', insCode: '621', category: 'flavour', status: 'concerning' },
    { name: 'Preservative', insCode: '211', category: 'preservative', status: 'concerning' },
  ],
};

test('buildComparisonRows pulls the full nutrient set from realNutrients', () => {
  const [maggi] = buildComparisonRows([MAGGI]);
  assert.equal(maggi.energyKcal, 457);
  assert.equal(maggi.proteinG, 9.5);
  assert.equal(maggi.totalCarbG, 60.3);
  assert.equal(maggi.sugarG, 6.1);
  assert.equal(maggi.totalFatG, 17.2);
  assert.equal(maggi.saturatedFatG, 7.9);
  assert.equal(maggi.sodiumMg, 890);
});

test('buildComparisonRows computes additives count + label', () => {
  const [maggi, yippee] = buildComparisonRows([MAGGI, YIPPEE]);
  assert.equal(maggi.additives, 2); // insCode 635 and 501
  assert.equal(maggi.additivesLabel, 'Some');
  assert.equal(yippee.additives, 0);
  assert.equal(yippee.additivesLabel, 'None');
});

test('buildComparisonRows computes a processing label from the "Highly processed" severity tier', () => {
  const rows = buildComparisonRows([MAGGI, YIPPEE]);
  // Both rows must get SOME label (Low/Medium/High), not null, given real ingredients.
  assert.ok(['Low', 'Medium', 'High'].includes(rows[0].processing));
  assert.ok(['Low', 'Medium', 'High'].includes(rows[1].processing));
});

test('personalFitLabels marks the best/worst personal score within the SET, not an absolute tier', () => {
  const profile = { nickname: 'Ibbu', priorities: ['lowerSodium', 'fewerAdditives'] };
  const rows = buildComparisonRows([MAGGI, YIPPEE, TOP_RAMEN], profile);
  const labels = personalFitLabels(rows);
  const yippeeRow = rows.find((r) => r.lookupKey === 'barcode:yippee');
  const maggiRow = rows.find((r) => r.lookupKey === 'barcode:maggi');
  assert.equal(labels[yippeeRow.lookupKey], 'Better fit');
  assert.equal(labels[maggiRow.lookupKey], 'Lower fit');
});

test('describeDifferences names real, large gaps as bullets with actual values', () => {
  const rows = buildComparisonRows([MAGGI, YIPPEE, TOP_RAMEN]);
  const { bullets } = describeDifferences(rows);
  const sugarBullet = bullets.find((b) => b.includes('sugar'));
  assert.match(sugarBullet, /Sunfeast Yippee Noodles Magic Masala has lower sugar \(4\.2g vs 6\.1g\) than Maggi 2 Minute Noodles Masala\./);

  const sodiumBullet = bullets.find((b) => b.includes('sodium'));
  assert.match(sodiumBullet, /Sunfeast Yippee Noodles Magic Masala has lower sodium \(620mg vs 890mg\) than Maggi 2 Minute Noodles Masala\./);
});

test('describeDifferences includes a personal-fit bullet naming a real concern only the worse product tripped', () => {
  const profile = { nickname: 'Ibbu', priorities: ['fewerAdditives'] };
  const rows = buildComparisonRows([MAGGI, YIPPEE], profile);
  const { bullets } = describeDifferences(rows, profile);
  const fitBullet = bullets.find((b) => b.startsWith('For Ibbu'));
  assert.match(fitBullet, /Sunfeast Yippee Noodles Magic Masala is a better fit due to fewer flagged additive-related concerns\./);
});

test('ourTake never credits a metric the profile never selected as a priority -- real bug found via live testing', () => {
  // Ibbu's real profile: prioritize protein, fewer additives, more
  // whole-food ingredients -- deliberately NOT lowerSugar or
  // lowerSodium. Maggi wins personalScore (fewest matched AVOID
  // concerns) while also happening to have the lowest sugar/sodium of
  // the three -- ourTake must not cite sugar/sodium as "why", since
  // Ibbu never asked to watch either one.
  const profile = { nickname: 'Ibbu', priorities: ['higherProtein', 'fewerAdditives', 'moreWholeFood'] };
  const rows = buildComparisonRows([MAGGI, YIPPEE, TOP_RAMEN], profile);
  const { ourTake } = describeDifferences(rows, profile);
  assert.doesNotMatch(ourTake, /sugar/);
  assert.doesNotMatch(ourTake, /sodium/);
});

test('ourTake DOES credit a metric the profile explicitly selected', () => {
  const profile = { nickname: 'Ibbu', priorities: ['lowerSugar', 'lowerSodium'] };
  const rows = buildComparisonRows([MAGGI, YIPPEE, TOP_RAMEN], profile);
  const { ourTake } = describeDifferences(rows, profile);
  // Yippee is both the personal-score winner here and the real sugar/
  // sodium winner -- now that those ARE selected priorities, citing
  // them is correct, not a bug.
  assert.match(ourTake, /Sunfeast Yippee Noodles Magic Masala/);
  assert.match(ourTake, /sugar|sodium/);
});

test('describeDifferences never claims a metric the lower-scoring product is actually better on', () => {
  // Yippee scores higher overall but this time has MORE sodium than Maggi
  // -- the sodium bullet must not claim Yippee "has lower sodium".
  const higherScoreMoreSodium = { ...YIPPEE, overallScore: 70, realNutrients: { ...YIPPEE.realNutrients, sodiumMg: 1400 } };
  const rows = buildComparisonRows([MAGGI, higherScoreMoreSodium]);
  const { bullets } = describeDifferences(rows);
  const sodiumBullet = bullets.find((b) => b.includes('sodium'));
  assert.match(sodiumBullet, /^Maggi 2 Minute Noodles Masala has lower sodium/);
});

test('describeDifferences returns an ourTake naming the top scorer and its real winning metrics', () => {
  const rows = buildComparisonRows([MAGGI, YIPPEE, TOP_RAMEN]);
  const { ourTake } = describeDifferences(rows);
  assert.match(ourTake, /^If choosing among these, Sunfeast Yippee Noodles Magic Masala has the highest score/);
});

test('describeDifferences returns a "too close to call" ourTake when every product ties', () => {
  const tied = buildComparisonRows([MAGGI, { ...YIPPEE, overallScore: MAGGI.overallScore }]);
  const { ourTake, bullets } = describeDifferences(tied);
  assert.match(ourTake, /close enough in score/);
  // No numeric bullets either -- ties on score don't retroactively make
  // real nutrient gaps stop being real, but there's nothing to declare
  // a "winner" over, so this asserts the tie case doesn't crash, not
  // that bullets must be empty.
  assert.ok(Array.isArray(bullets));
});

test('describeDifferences returns empty bullets and null ourTake for fewer than 2 products', () => {
  const rows = buildComparisonRows([MAGGI]);
  const { bullets, ourTake } = describeDifferences(rows);
  assert.deepEqual(bullets, []);
  assert.equal(ourTake, null);
});
