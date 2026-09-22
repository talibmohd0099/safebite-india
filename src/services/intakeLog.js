// src/services/intakeLog.js
//
// "My Intake" -- a plain log of packaged foods the person has told the app
// they consumed today, and what that amount actually added up to. NOT a
// calorie-goal tracker: no personal target, no age/weight/height, no
// biometrics, nothing estimated. See the product discussion this was
// scoped from -- the three hard rules that came out of it:
//
//   1. Never estimate. A product with no real nutrition data on file simply
//      can't be logged (see canLogIntake) -- no ingredient-based guessing.
//   2. Never show a percentage for calories/protein/carbs/fat/fibre -- WHO
//      doesn't publish one universal number for those (unlike sodium/added
//      sugar/saturated fat/trans fat, which DO have a single adult daily
//      cap -- see dailyHabitCheck.js's NUTRIENT_LIMITS, reused as-is here).
//      A silent "% of 2000 kcal" would quietly reintroduce a personal
//      target through the back door.
//   3. This is a LOG, not a diagnosis. Every total is phrased as "logged"
//      /"added", never "you have eaten" or "your body has" -- the app only
//      knows what was told to it, not what actually happened.
//
// Local-only (localStorage), same as History -- there is no account system
// in this app, so this is one shared log for the device, not per Family
// profile (a deliberate V1 scope choice; splitting by profile is a later
// step if it turns out to matter).
import { getNutrientsPer100, toServing } from './nutrientBasis.js';

const LOG_KEY = 'foodguard-intake-log';
const LAST_PORTION_KEY = 'foodguard-intake-last-portion';
const MAX_ENTRIES = 500; // a generous cap so the log can't grow unbounded forever

// Only these are meaningful to total across a whole day of different
// products -- matches the fields the rest of the app already treats as
// "real, comparable, worth showing" (see nutrientBasis.js/dailyHabitCheck.js).
const TOTAL_KEYS = ['caloriesKcal', 'proteinG', 'carbohydrateG', 'totalFatG', 'totalSugarG', 'addedSugarG', 'sodiumMg', 'fibreG'];

/** True when a report has real enough nutrition data to log a portion of it. Calories is the one non-negotiable field -- nothing else here means anything without it. */
export function canLogIntake(report) {
  const per100 = getNutrientsPer100(report);
  return typeof per100?.caloriesKcal === 'number';
}

function readLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLog(entries) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))); } catch { /* private mode etc. */ }
}

/**
 * Logs one portion of a product. Amount is a plain number (grams or ml --
 * the underlying per-100 scaling math doesn't care which, same convention
 * as the rest of the app; `unit` is display-only).
 * @returns the new entry, or null if the report can't be logged (see canLogIntake).
 */
export function addLogEntry(report, amount, unit = 'g') {
  if (!canLogIntake(report) || !(amount > 0)) return null;
  const per100 = getNutrientsPer100(report);
  const nutrients = toServing(per100, amount);

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    loggedAt: new Date().toISOString(),
    lookupKey: report.lookupKey || null,
    productName: report.productName || 'Unknown Product',
    imageUrl: report.imageUrl || null,
    amount,
    unit,
    nutrients,
  };

  writeLog([...readLog(), entry]);
  if (report.lookupKey) rememberPortion(report.lookupKey, amount, unit);
  return entry;
}

export function removeLogEntry(id) {
  writeLog(readLog().filter((e) => e.id !== id));
}

/** Every logged entry, most recent first. */
export function getAllEntries() {
  return [...readLog()].reverse();
}

const isSameLocalDay = (isoA, isoB) => new Date(isoA).toDateString() === new Date(isoB).toDateString();

/** Today's entries (by the device's own local calendar day), most recent first. */
export function getTodaysEntries(now = new Date()) {
  return readLog().filter((e) => isSameLocalDay(e.loggedAt, now.toISOString())).reverse();
}

/**
 * Sums today's entries. Returns { totals, entryCount } -- totals only
 * includes keys at least one entry actually had (no zero-filled fields
 * pretending to be real data).
 */
export function getTodaysTotals(now = new Date()) {
  const entries = getTodaysEntries(now);
  const totals = {};
  for (const entry of entries) {
    for (const key of TOTAL_KEYS) {
      const v = entry.nutrients?.[key];
      if (typeof v === 'number') totals[key] = (totals[key] || 0) + v;
    }
  }
  for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key] * 10) / 10;
  return { totals, entryCount: entries.length };
}

// Remembers the last amount/unit logged for a given product, so logging
// the same thing again (very common -- the same brand of milk every
// morning) is a single tap instead of re-typing the amount each time.
function readLastPortions() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_PORTION_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function rememberPortion(lookupKey, amount, unit) {
  try {
    const all = readLastPortions();
    all[lookupKey] = { amount, unit };
    localStorage.setItem(LAST_PORTION_KEY, JSON.stringify(all));
  } catch { /* private mode etc. */ }
}

/** The last amount/unit logged for this product, or null if never logged before. */
export function lastPortionFor(lookupKey) {
  if (!lookupKey) return null;
  return readLastPortions()[lookupKey] || null;
}
