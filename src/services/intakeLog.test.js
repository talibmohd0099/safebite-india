import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage polyfill -- these tests run under Node's own test
// runner (no DOM/browser here), same convention as the rest of this
// service's persistence (see storage.js). Functions in intakeLog.js only
// touch localStorage when actually called, never at module load, so
// setting this before any test() body runs is enough regardless of where
// this sits relative to the import below.
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
globalThis.localStorage = makeMemoryStorage();

const { addLogEntry, removeLogEntry, getAllEntries, getTodaysEntries, getTodaysTotals, canLogIntake, lastPortionFor } =
  await import('./intakeLog.js');

const reset = () => globalThis.localStorage.clear();

const WITH_DATA = {
  lookupKey: 'barcode:123',
  productName: 'Toned Milk',
  imageUrl: 'https://example.com/milk.jpg',
  nutrientsPer100: { caloriesKcal: 60, proteinG: 3.2, carbohydrateG: 4.7, totalFatG: 3, sodiumMg: 45, addedSugarG: 4.7 },
};
const NO_DATA = { lookupKey: 'barcode:999', productName: 'Mystery Snack', nutrientsPer100: { proteinG: 5 } }; // no calories

test('a product with no calorie data can never be logged (rule 1: never estimate)', () => {
  assert.equal(canLogIntake(NO_DATA), false);
  assert.equal(addLogEntry(NO_DATA, 100, 'g'), null);
});

test('a product with real calorie data can be logged, and a zero/negative amount is rejected', () => {
  assert.equal(canLogIntake(WITH_DATA), true);
  assert.equal(addLogEntry(WITH_DATA, 0, 'g'), null);
  assert.equal(addLogEntry(WITH_DATA, -5, 'g'), null);
});

test('logging a portion scales the per-100 figures down to that amount, not the full 100g', () => {
  reset();
  const entry = addLogEntry(WITH_DATA, 250, 'ml'); // a 250ml glass of milk
  assert.equal(entry.nutrients.caloriesKcal, 150); // 60 * 2.5
  assert.equal(entry.nutrients.sodiumMg, 112.5);
  assert.equal(entry.amount, 250);
  assert.equal(entry.unit, 'ml');
  assert.equal(entry.productName, 'Toned Milk');
});

test('getTodaysTotals sums multiple entries and only includes fields that were actually present', () => {
  reset();
  addLogEntry(WITH_DATA, 100, 'g'); // 60 kcal, 45mg sodium
  addLogEntry(WITH_DATA, 200, 'g'); // 120 kcal, 90mg sodium
  const { totals, entryCount } = getTodaysTotals();
  assert.equal(entryCount, 2);
  assert.equal(totals.caloriesKcal, 180);
  assert.equal(totals.sodiumMg, 135);
  assert.equal('fibreG' in totals, false); // never had fibre data -- not silently zero-filled
});

test('entries from a different calendar day are not counted as "today"', () => {
  reset();
  addLogEntry(WITH_DATA, 100, 'g');
  const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
  assert.equal(getTodaysEntries(yesterday).length, 0);
  assert.equal(getTodaysTotals(yesterday).entryCount, 0);
});

test('removeLogEntry deletes exactly that entry', () => {
  reset();
  const a = addLogEntry(WITH_DATA, 100, 'g');
  const b = addLogEntry(WITH_DATA, 200, 'g');
  removeLogEntry(a.id);
  const remaining = getAllEntries();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, b.id);
});

test('getAllEntries returns most-recently-logged first', () => {
  reset();
  addLogEntry(WITH_DATA, 50, 'g');
  addLogEntry(WITH_DATA, 60, 'g');
  const all = getAllEntries();
  assert.equal(all[0].amount, 60);
  assert.equal(all[1].amount, 50);
});

test('lastPortionFor remembers the most recent amount for one-tap re-logging', () => {
  reset();
  assert.equal(lastPortionFor('barcode:123'), null);
  addLogEntry(WITH_DATA, 250, 'ml');
  assert.deepEqual(lastPortionFor('barcode:123'), { amount: 250, unit: 'ml' });
  addLogEntry(WITH_DATA, 100, 'g');
  assert.deepEqual(lastPortionFor('barcode:123'), { amount: 100, unit: 'g' }); // most recent wins
});

test('logging never crashes when a product has no lookupKey (e.g. an unsaved scan)', () => {
  reset();
  const entry = addLogEntry({ productName: 'Unsaved Scan', nutrientsPer100: { caloriesKcal: 200 } }, 50, 'g');
  assert.equal(entry.nutrients.caloriesKcal, 100);
  assert.equal(entry.lookupKey, null);
});
