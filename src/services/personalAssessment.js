// src/services/personalAssessment.js
//
// Pure logic — no AI, no network, same philosophy as scoringEngine.js
// and ingredientParser.js. Takes a product's already-computed report
// (buildReport()'s output) and a family profile's selected nutrition
// priorities, and answers a different question than the universal
// score: not "is this healthy", but "does this fit what THIS person
// is trying to watch". The universal score never changes — this is a
// second, derived layer on top of it.
//
// Deliberately conservative: this is a nutrition-priority match, not a
// medical assessment. Never claims a product is "safe" or "unsafe" for
// a condition — only "aligned" or "less aligned" with selected
// priorities. See PERSONAL_TIER_LABELS below.

import { getIngredientSeverity, getScoreColor } from '../utils/storage.js';
import { NUTRIENT_LIMITS } from './dailyHabitCheck.js';

const LIMIT_BY_KEY = Object.fromEntries(NUTRIENT_LIMITS.map((n) => [n.key, n.limit]));

// Not part of dailyHabitCheck.js's WHO-sourced limits (calories were
// never part of that feature) -- ~2000 kcal/day for an adult on a
// standard reference diet, matching the "2000-kcal reference diet"
// already cited in dailyHabitCheck.js. This file's own judgment call,
// not independently vetted elsewhere in this codebase.
const CALORIE_REFERENCE_KCAL = 2000;

// Same "is this actually worth mentioning" bar dailyHabitCheck.js uses
// -- below this, one packaged product's share of a full day's limit
// isn't a meaningful signal on its own. Only used for AVOID_PRIORITIES
// below (sodium/sugar/sat fat/calories) -- "what share of a daily
// LIMIT does this one item use up" is a fair question for something
// you're trying not to overdo. It is NOT used for SEEK_MORE_PRIORITIES
// (protein, whole food) -- see the comment on PROTEIN_NOTABLE_G for why
// applying the same logic there was a real bug, not just imprecise.
const REAL_DATA_THRESHOLD_PERCENT = 30;

// A plain gram cutoff, not a share of a daily target -- "does this one
// item make a real protein contribution" is a different question than
// "does it blow past a daily limit", and answering it with "30% of a
// full day's protein from one item" set the bar so high that a glass of
// milk or a boiled egg would also fail it. 5g roughly separates "has a
// real, if modest, protein contribution" from "isn't really a protein
// food" for a typical single serving -- this file's own judgment call,
// not an authoritative RDA figure, same caveat as CALORIE_REFERENCE_KCAL.
const PROTEIN_NOTABLE_G = 5;

function percentOfLimit(amount, limit) {
  return typeof amount === 'number' && typeof limit === 'number' ? (amount / limit) * 100 : null;
}

// The full set of selectable nutrition priorities, and their i18n keys
// -- shared between the Family profile editor (src/pages/Family.jsx)
// and the Result page's personal score card, so both always show the
// exact same list/wording instead of two independently-maintained copies.
export const PRIORITIES = [
  'lowerSugar', 'lowerSodium', 'lowerSatFat', 'higherProtein',
  'lessProcessed', 'fewerAdditives', 'lowerCalories', 'moreWholeFood',
];
export const PRIORITY_LABEL_KEY = {
  lowerSugar: 'priorityLowerSugar',
  lowerSodium: 'priorityLowerSodium',
  lowerSatFat: 'priorityLowerSatFat',
  // Label reads "Prioritize protein", not "Higher protein" -- the old
  // wording implied FoodGuard would only ever surface objectively
  // high-protein foods, when what it actually does is pay attention to
  // this dimension and say so plainly either way. The stored key stays
  // `higherProtein` so nobody's already-saved profile silently loses
  // this preference.
  higherProtein: 'priorityHigherProtein',
  lessProcessed: 'priorityLessProcessed',
  fewerAdditives: 'priorityFewerAdditives',
  lowerCalories: 'priorityLowerCalories',
  moreWholeFood: 'priorityMoreWholeFood',
};

// Two fundamentally different questions, per a real bug found in
// production (see PROTEIN_NOTABLE_G above): "avoid" priorities ask
// "does this one item use up an unreasonable SHARE of a daily limit" --
// a fair, meaningful thing to flag and worth deducting points for.
// "Seek more" priorities ask "does this item make a REAL CONTRIBUTION
// toward a goal" -- a plain carb staple (chapathi, rice, bread) failing
// to be a major protein source isn't a flaw in the food, so it produces
// an informational NOTE (see PRIORITY_NOTE_KEY below), never a score
// deduction. Getting this distinction wrong is exactly what caused a
// genuinely fine whole-wheat chapathi to read "Low protein" with a
// warning triangle and a personal-score penalty.
export const AVOID_PRIORITIES = new Set([
  'lowerSugar', 'lowerSodium', 'lowerSatFat', 'lessProcessed', 'fewerAdditives', 'lowerCalories',
]);
export const SEEK_MORE_PRIORITIES = new Set(['higherProtein', 'moreWholeFood']);

// What's wrong with the PRODUCT (shown as the "why" reason) for an
// AVOID-type priority match -- distinct from PRIORITY_LABEL_KEY, which
// is what the PERSON wants. E.g. someone selected "lower sodium" (the
// priority); the product's own problem is "higher sodium" (the
// concern) -- same axis, opposite direction. Only ever shown with a
// real score deduction behind it (see AVOID_PRIORITIES above).
export const PRIORITY_CONCERN_KEY = {
  lowerSugar: 'concernSugar',
  lowerSodium: 'concernSodium',
  lowerSatFat: 'concernSatFat',
  lessProcessed: 'concernProcessed',
  fewerAdditives: 'concernAdditives',
  lowerCalories: 'concernCalories',
};

// The informational equivalent for SEEK_MORE-type priorities -- never
// paired with a score deduction, and deliberately not phrased as a
// warning ("Not a major protein source", not "Low protein").
export const PRIORITY_NOTE_KEY = {
  higherProtein: 'noteProtein',
  moreWholeFood: 'noteWholeFood',
};

// Each check answers one question: "does this product have a real,
// already-detected characteristic that conflicts with this priority?"
// Takes (ingredients, realNutrients) -- realNutrients is buildReport()'s
// report.realNutrients when Open Food Facts or Blinkit actually had
// real label numbers for this exact product (see analyzeText.js), or
// undefined otherwise. A real number is always checked FIRST and wins
// when present, since it's an actual measurement rather than an
// inference from one ingredient's category/status tag; the ingredient-
// tag heuristic is the fallback for the (currently more common) case
// of a text/photo scan with no barcode behind it. No per-ingredient or
// per-nutrient number is ever exposed to the UI either way.
const PRIORITY_CHECKS = {
  lowerSugar: (ingredients, real) => {
    const pct = percentOfLimit(real?.addedSugarG, LIMIT_BY_KEY.addedSugarG);
    if (pct != null) return pct >= REAL_DATA_THRESHOLD_PERCENT;
    return ingredients.some((i) => i.category === 'sweetener' && i.status !== 'safe');
  },

  lowerSodium: (ingredients, real) => {
    const pct = percentOfLimit(real?.sodiumMg, LIMIT_BY_KEY.sodiumMg);
    if (pct != null) return pct >= REAL_DATA_THRESHOLD_PERCENT;
    return ingredients.some((i) => i.status !== 'safe' && /\b(salt|sodium)\b/i.test(i.name || ''));
  },

  lowerSatFat: (ingredients, real) => {
    const pct = percentOfLimit(real?.saturatedFatG, LIMIT_BY_KEY.saturatedFatG);
    if (pct != null) return pct >= REAL_DATA_THRESHOLD_PERCENT;
    return ingredients.some((i) => (i.category === 'fat' || i.category === 'oil') && i.status !== 'safe');
  },

  // A SEEK_MORE priority -- this never deducts points (see
  // AVOID_PRIORITIES/SEEK_MORE_PRIORITIES above), only ever produces an
  // informational note. Checked against a plain gram cutoff, not a
  // share of a daily target -- see PROTEIN_NOTABLE_G for why.
  higherProtein: (ingredients, real) => {
    if (typeof real?.proteinG === 'number') {
      return real.proteinG < PROTEIN_NOTABLE_G;
    }
    // Absence, not presence -- a product with no real protein source at
    // all is what this note is about, not any one bad ingredient.
    return !ingredients.some((i) => i.category === 'protein' && i.status === 'safe');
  },

  // Reuses the exact same "Highly processed" tier already shown
  // elsewhere in the app (getIngredientSeverity) -- deliberately not a
  // separate classification, so this can never disagree with what the
  // Ingredients tab already says about the same product. No real-data
  // equivalent exists for "how processed is this", so this has only
  // ever had the one signal.
  lessProcessed: (ingredients) => ingredients.some((i) => getIngredientSeverity(i).label === 'Highly processed'),

  // A real INS/E code is the one thing an additive can be identified by
  // with total confidence (unlike "is this natural", which is fuzzy) --
  // 2 or more is treated as notably additive-heavy.
  fewerAdditives: (ingredients) => ingredients.filter((i) => i.insCode).length >= 2,

  // Only ever triggers when a real calorie number exists (Open Food
  // Facts or Blinkit) -- rather than guess without one, this priority
  // stays silent. Honest "we don't know" beats a fabricated answer,
  // same principle applied throughout this app's scoring.
  lowerCalories: (ingredients, real) => {
    const pct = percentOfLimit(real?.caloriesKcal, CALORIE_REFERENCE_KCAL);
    return pct != null && pct >= REAL_DATA_THRESHOLD_PERCENT;
  },

  // Also a SEEK_MORE priority (informational note, never a deduction --
  // unlike lessProcessed below, which checks the exact same signal but
  // as an AVOID priority that does deduct). Same detectable signal as
  // lessProcessed for now -- a product heavy on refined/processed
  // ingredients is also light on whole-food ones. Not pretending these
  // are independently measured.
  moreWholeFood: (ingredients) => ingredients.some((i) => getIngredientSeverity(i).label === 'Highly processed'),
};

// Points deducted per matched concern. Never rendered -- the UI only
// ever shows the resulting score and the plain-language reasons, never
// this number (see rule: proprietary methodology stays hidden).
const POINTS_PER_CONCERN = 8;

// The personal score uses the SAME 0-100 scale and the SAME tier labels
// as the universal score -- deliberately, after a version that didn't.
//
// This used to carry its own vocabulary (Good Choice / Moderate / Limit
// / Minimize / Avoid) on the reasoning that "personal fit" is a
// different concept and shouldn't be confused with the universal
// verdict. In practice it created precisely the confusion it was meant
// to prevent: a real product showed "General 53 -- Moderate" beside
// "For Ibbu 53 -- Limit". Same number, same scale, two different words,
// no way for anyone to tell what the difference was supposed to mean.
//
// One scale, one set of words. When the personal score matches the
// general one the two now read identically, which is the honest
// answer; when priorities actually cost the product points, the label
// differs because the SCORE differs, which is the only reason it ever
// should.
export function getPersonalScoreColor(score) {
  return getScoreColor(score);
}

// Same breakpoints again, but returning the i18n key for the "Should I
// eat it?" answer word already used (and translated) for the universal
// score on the Result page (eatAnswerYes/Mostly/Occasionally/Rarely/
// Avoid) -- reused as-is for "Should {name} eat it?" so the two
// features share one vocabulary instead of inventing a second.
export function getPersonalEatAnswerKey(score) {
  if (score >= 85) return 'eatAnswerYes';
  if (score >= 65) return 'eatAnswerMostly';
  if (score >= 45) return 'eatAnswerOccasionally';
  if (score >= 25) return 'eatAnswerRarely';
  return 'eatAnswerAvoid';
}

/**
 * @param {object} report - buildReport()'s output (must have `ingredients`
 *   and `overallScore`); `report.realNutrients`, when present (a barcode-
 *   or Blinkit-sourced product Open Food Facts/Blinkit actually had real
 *   label numbers for -- see analyzeText.js), is checked as the PRIMARY
 *   signal for lowerSugar/lowerSodium/lowerSatFat/higherProtein/
 *   lowerCalories. Most text/photo scans won't have it, so every one of
 *   those checks still falls back to the ingredient-tag heuristic.
 * @param {object} profile - a family profile with a `priorities` array of
 *   PRIORITY_CHECKS keys.
 * @returns {{ personalScore: number, tier: {label, color, bg},
 *   matchedConcerns: Array<{priorityKey}>, notes: Array<{priorityKey}>,
 *   hasNoConcerns: boolean, hasNothingToShow: boolean }}
 */
export function calculatePersonalAssessment(report, profile) {
  const ingredients = report?.ingredients || [];
  const realNutrients = report?.realNutrients;
  const priorities = profile?.priorities || [];

  const matched = priorities.filter((key) => PRIORITY_CHECKS[key]?.(ingredients, realNutrients));
  // AVOID matches deduct points (a real excess is a meaningful thing to
  // flag); SEEK_MORE matches never do (see AVOID_PRIORITIES/
  // SEEK_MORE_PRIORITIES above) -- they're informational notes only,
  // e.g. "not a major protein source" for an otherwise-fine chapathi.
  const matchedConcerns = matched.filter((key) => AVOID_PRIORITIES.has(key)).map((priorityKey) => ({ priorityKey }));
  const notes = matched.filter((key) => SEEK_MORE_PRIORITIES.has(key)).map((priorityKey) => ({ priorityKey }));

  const universalScore = typeof report?.overallScore === 'number' ? report.overallScore : 0;
  // Never exceeds the universal score -- a personal lens can only narrow
  // suitability further, never make a product "healthier than it is".
  // Notes never factor in here at all.
  const personalScore = Math.max(0, universalScore - matchedConcerns.length * POINTS_PER_CONCERN);

  return {
    personalScore,
    tier: getPersonalScoreColor(personalScore),
    matchedConcerns,
    notes,
    hasNoConcerns: matchedConcerns.length === 0,
    hasNothingToShow: matchedConcerns.length === 0 && notes.length === 0,
  };
}
