import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentLabel } from './labelXray.js';

const lit = (segs) => segs.filter((s) => s.ingredientIndex != null).map((s) => [s.text, s.ingredientIndex]);

test('lights up cleaned-up names inside the raw label text', () => {
  const text = 'Corn (68%), Edible Vegetable Oil (Rice Bran Oil), Brown Sugar, Emulsifier (322), Salt.';
  const segs = segmentLabel(text, [
    { name: 'Corn' },
    { name: 'Edible Vegetable Oil Rice Bran Oil' },
    { name: 'Brown Sugar' },
    { name: 'Emulsifier (INS 322)' },
    { name: 'Salt' },
  ]);
  assert.equal(segs.map((s) => s.text).join(''), text); // nothing lost or reordered
  assert.deepEqual(lit(segs), [
    ['Corn', 0],
    ['Edible Vegetable Oil (Rice Bran Oil)', 1],
    ['Brown Sugar', 2],
    ['Emulsifier', 3],
    ['Salt', 4],
  ]);
});

test('longer names win their words; whole words only', () => {
  const segs = segmentLabel('Tomato Ketchup, Tomato, Saltpetre', [{ name: 'Tomato' }, { name: 'Tomato Ketchup' }, { name: 'Salt' }]);
  assert.deepEqual(lit(segs), [['Tomato Ketchup', 1], ['Tomato', 0]]);
});

test('unfound ingredients are simply not lit; empty input is safe', () => {
  assert.deepEqual(lit(segmentLabel('Wheat flour, water', [{ name: 'Palm Oil' }])), []);
  assert.deepEqual(segmentLabel('', [{ name: 'x' }]), []);
  assert.deepEqual(segmentLabel('Water', null), [{ text: 'Water', ingredientIndex: null }]);
});
