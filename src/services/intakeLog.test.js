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

const { addLogEntry, removeLogEntry, getAllEntries, getTodaysEntries, getTodaysTotals, getEntriesForDay, getTotalsForDay, getLoggedDays, canLogIntake, lastPortionFor } =
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

// A real bug found by reviewing an actual logged day: a product with no
// distinct total-sugar figure on its label (only addedSugarG, e.g. a plain
// dal/rajma) was silently EXCLUDED from the day's "Total sugar" sum while
// still counting toward "Added sugar" -- two numbers that looked
// comparable but were built from different sets of products, and "Total
// sugar" could even read lower than "Added sugar" as a result.
test("a day's total-sugar figure falls back to added sugar per entry, so it's never built from fewer products than added-sugar's own total", () => {
  reset();
  // Has both figures (differ, so totalSugarG is genuinely stored).
  addLogEntry({ lookupKey: 'a', productName: 'Chocolate', nutrientsPer100: { caloriesKcal: 500, totalSugarG: 50, addedSugarG: 45 } }, 100, 'g');
  // Only ever had ONE sugar figure (e.g. Open Food Facts/Blinkit never
  // published a separate "total" -- addedSugarG stands in for it, per
  // nutrientBasis.js's own dedup rule). No totalSugarG key at all.
  addLogEntry({ lookupKey: 'b', productName: 'Rajma', nutrientsPer100: { caloriesKcal: 100, addedSugarG: 0 } }, 50, 'g');

  const { totals } = getTodaysTotals();
  // Both entries contribute to both totals -- entry b has no distinct
  // total-sugar figure, so it falls back to its own addedSugarG (0) for
  // the "total" sum too, instead of being dropped from it entirely.
  assert.equal(totals.addedSugarG, 45); // 45 + 0
  assert.equal(totals.totalSugarG, 50); // 50 + 0(fallback)
});

test('the total-sugar fallback is proven with a non-zero fallback value', () => {
  reset();
  addLogEntry({ lookupKey: 'a', productName: 'A', nutrientsPer100: { caloriesKcal: 100, totalSugarG: 10, addedSugarG: 8 } }, 100, 'g');
  addLogEntry({ lookupKey: 'b', productName: 'B (no distinct total)', nutrientsPer100: { caloriesKcal: 100, addedSugarG: 6 } }, 100, 'g');
  const { totals } = getTodaysTotals();
  assert.equal(totals.addedSugarG, 14); // 8 + 6
  assert.equal(totals.totalSugarG, 16); // 10 + 6(fallback) -- the old buggy code gave 10 here, silently dropping B
});

test('getEntriesForDay/getTotalsForDay generalize "today" to any date, and getLoggedDays lists every day that has entries', () => {
  reset();
  addLogEntry(WITH_DATA, 100, 'g');
  const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
  assert.equal(getEntriesForDay(new Date()).length, 1);
  assert.equal(getEntriesForDay(yesterday).length, 0);
  assert.equal(getTotalsForDay(new Date()).totals.caloriesKcal, 60);
  assert.equal(getTotalsForDay(yesterday).entryCount, 0);

  const days = getLoggedDays();
  assert.equal(days.length, 1);
  assert.equal(days[0].toDateString(), new Date().toDateString());
});
