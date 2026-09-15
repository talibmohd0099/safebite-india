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

import { getIngredientSeverity } from '../utils/storage.js';
import { NUTRIENT_LIMITS } from './dailyHabitCheck.js';

const LIMIT_BY_KEY = Object.fromEntries(NUTRIENT_LIMITS.map((n) => [n.key, n.limit]));

// Not part of dailyHabitCheck.js's WHO-sourced limits (calories/protein
// were never part of that feature) -- reasonable general reference
// points (~2000 kcal/day for an adult on a standard reference diet,
// matching the "2000-kcal reference diet" already cited in
// dailyHabitCheck.js; ~50g/day protein, a commonly-cited ICMR/WHO-style
// adult reference), used the same way: a real per-100g-or-per-pack
// number, checked as a percentage of a full day's worth. Unlike the
// four WHO-sourced limits, these two are this file's own judgment
// call, not independently vetted elsewhere in this codebase.
const CALORIE_REFERENCE_KCAL = 2000;
const PROTEIN_REFERENCE_G = 50;

// Same "is this actually worth mentioning" bar dailyHabitCheck.js uses
// -- below this, one packaged product's share of a full day's limit
// isn't a meaningful signal on its own.
const REAL_DATA_THRESHOLD_PERCENT = 30;

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
  higherProtein: 'priorityHigherProtein',
  lessProcessed: 'priorityLessProcessed',
  fewerAdditives: 'priorityFewerAdditives',
  lowerCalories: 'priorityLowerCalories',
  moreWholeFood: 'priorityMoreWholeFood',
};

// What's wrong with the PRODUCT (shown as the "why" reason) -- distinct
// from PRIORITY_LABEL_KEY, which is what the PERSON wants. E.g. someone
// selected "lower sodium" (the priority); the product's own problem is
// "higher sodium" (the concern) -- same axis, opposite direction.
export const PRIORITY_CONCERN_KEY = {
  lowerSugar: 'concernSugar',
  lowerSodium: 'concernSodium',
  lowerSatFat: 'concernSatFat',
  higherProtein: 'concernProtein',
  lessProcessed: 'concernProcessed',
  fewerAdditives: 'concernAdditives',
  lowerCalories: 'concernCalories',
  moreWholeFood: 'concernWholeFood',
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

  higherProtein: (ingredients, real) => {
    // Inverted from the others -- the concern here is a LOW share of a
    // full day's protein reference, not a high one.
    if (typeof real?.proteinG === 'number') {
      return (real.proteinG / PROTEIN_REFERENCE_G) * 100 < REAL_DATA_THRESHOLD_PERCENT;
    }
    // Absence, not presence -- a product with no real protein source at
    // all is what conflicts with this goal, not any one bad ingredient.
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

  // Same detectable signal as lessProcessed for now -- a product heavy
  // on refined/processed ingredients is also light on whole-food ones.
  // Not pretending these are independently measured.
  moreWholeFood: (ingredients) => ingredients.some((i) => getIngredientSeverity(i).label === 'Highly processed'),
};

// Points deducted per matched concern. Never rendered -- the UI only
// ever shows the resulting score and the plain-language reasons, never
// this number (see rule: proprietary methodology stays hidden).
const POINTS_PER_CONCERN = 8;

// Same 85/65/45/25 breakpoints as SCORE_TIERS (utils/storage.js) /
// VERDICT_TIERS (scoringEngine.js), for colour consistency -- but
// distinct, non-medical labels, since "personal fit" is a different
// concept from the universal verdict and must not be confused with it.
const PERSONAL_TIERS = [
  { min: 85, label: 'Good Choice', token: 'very-healthy' },
  { min: 65, label: 'Moderate', token: 'good' },
  { min: 45, label: 'Limit', token: 'moderate' },
  { min: 25, label: 'Occasional', token: 'poor' },
  { min: 0, label: 'Avoid', token: 'very-poor' },
];

export function getPersonalScoreColor(score) {
  const tier = PERSONAL_TIERS.find((t) => score >= t.min) || PERSONAL_TIERS[PERSONAL_TIERS.length - 1];
  return { label: tier.label, color: `var(--v-${tier.token})`, bg: `var(--v-${tier.token}-bg)` };
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
 *   matchedConcerns: Array<{priorityKey}>, hasNoConcerns: boolean }}
 */
export function calculatePersonalAssessment(report, profile) {
  const ingredients = report?.ingredients || [];
  const realNutrients = report?.realNutrients;
  const priorities = profile?.priorities || [];

  const matchedConcerns = priorities
    .filter((key) => PRIORITY_CHECKS[key]?.(ingredients, realNutrients))
    .map((priorityKey) => ({ priorityKey }));

  const universalScore = typeof report?.overallScore === 'number' ? report.overallScore : 0;
  // Never exceeds the universal score -- a personal lens can only narrow
  // suitability further, never make a product "healthier than it is".
  const personalScore = Math.max(0, universalScore - matchedConcerns.length * POINTS_PER_CONCERN);

  return {
    personalScore,
    tier: getPersonalScoreColor(personalScore),
    matchedConcerns,
    hasNoConcerns: matchedConcerns.length === 0,
  };
}
