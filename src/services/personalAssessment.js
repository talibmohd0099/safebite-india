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
  moreWholeFood: 'concernWholeFood',
};

// Each check answers one question: "does this product have a real,
// already-detected characteristic that conflicts with this priority?"
// All of them reuse ingredient fields buildReport() already computed
// (status/category/penalty/insCode/name) -- no new classification
// invented, no per-ingredient number ever exposed to the UI.
const PRIORITY_CHECKS = {
  lowerSugar: (ingredients) =>
    ingredients.some((i) => i.category === 'sweetener' && i.status !== 'safe'),

  lowerSodium: (ingredients) =>
    ingredients.some(
      (i) => i.status !== 'safe' && /\b(salt|sodium)\b/i.test(i.name || ''),
    ),

  lowerSatFat: (ingredients) =>
    ingredients.some((i) => (i.category === 'fat' || i.category === 'oil') && i.status !== 'safe'),

  // Absence, not presence -- a product with no real protein source at
  // all is what conflicts with this goal, not any one bad ingredient.
  higherProtein: (ingredients) => !ingredients.some((i) => i.category === 'protein' && i.status === 'safe'),

  // Reuses the exact same "Highly processed" tier already shown
  // elsewhere in the app (getIngredientSeverity) -- deliberately not a
  // separate classification, so this can never disagree with what the
  // Ingredients tab already says about the same product.
  lessProcessed: (ingredients) => ingredients.some((i) => getIngredientSeverity(i).label === 'Highly processed'),

  // A real INS/E code is the one thing an additive can be identified by
  // with total confidence (unlike "is this natural", which is fuzzy) --
  // 2 or more is treated as notably additive-heavy.
  fewerAdditives: (ingredients) => ingredients.filter((i) => i.insCode).length >= 2,

  // No reliable per-ingredient calorie signal exists yet (buildReport()
  // doesn't carry one) -- rather than guess, this priority never
  // triggers a concern in V1. Honest "we don't know" beats a fabricated
  // answer, same principle applied throughout this app's scoring.
  lowerCalories: () => false,

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
 *   and `overallScore`); a report's `dailyHabitCheck`, if present, is used
 *   as a secondary confirmation signal only -- most text/photo scans won't
 *   have real nutrition-panel numbers, so this is never required.
 * @param {object} profile - a family profile with a `priorities` array of
 *   PRIORITY_CHECKS keys.
 * @returns {{ personalScore: number, tier: {label, color, bg},
 *   matchedConcerns: Array<{priorityKey}>, hasNoConcerns: boolean }}
 */
export function calculatePersonalAssessment(report, profile) {
  const ingredients = report?.ingredients || [];
  const priorities = profile?.priorities || [];

  const matchedConcerns = priorities
    .filter((key) => PRIORITY_CHECKS[key]?.(ingredients))
    .map((priorityKey) => ({ priorityKey }));

  // A real nutrition-panel signal that lines up with a selected priority
  // (but wasn't already caught above) adds one more concern -- e.g. a
  // barcode-sourced product whose sodium is genuinely >=30% of the daily
  // limit, for someone who selected "lower sodium".
  const habit = report?.dailyHabitCheck;
  const HABIT_TO_PRIORITY = { sodiumMg: 'lowerSodium', addedSugarG: 'lowerSugar', saturatedFatG: 'lowerSatFat' };
  if (habit && priorities.includes(HABIT_TO_PRIORITY[habit.nutrientKey])) {
    const already = matchedConcerns.some((c) => c.priorityKey === HABIT_TO_PRIORITY[habit.nutrientKey]);
    if (!already) matchedConcerns.push({ priorityKey: HABIT_TO_PRIORITY[habit.nutrientKey] });
  }

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
