// src/services/scoreWaterfall.js
//
// "How we got to 62": the score as a waterfall -- starts at 100, each
// ingredient that cost points takes its bite, then any cap that applied
// (a harmful/concerning ingredient, a real nutrient over WHO's bar, the
// fried/energy-dense ceiling). Built from scoringEngine.js's OWN
// functions, and returned ONLY when the steps land exactly on the stored
// score -- if a report was scored by an older formula and the numbers
// no longer reproduce, showing a waterfall would be showing a made-up
// explanation, so it returns null instead.
import { penaltyContributions, SCORE_CAPS, squeezeToCap } from './scoringEngine.js';

// The biggest few by name; the rest are merged into one "others" step.
const NAMED_STEPS = 5;
// Under half a point isn't a visible bar -- folded into "others".
const MIN_NAMED_POINTS = 0.5;

/**
 * @returns {null | {
 *   final: number,
 *   steps: Array<{ kind: 'ingredient'|'others'|'harmfulCap'|'concerningCap'|'nutrientCap'|'densityCeiling',
 *     name?: string, ingredientIndex?: number, points: number, from: number, to: number }>,
 * }}
 */
export function buildScoreWaterfall(report) {
  const ingredients = report?.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0) return null;
  if (typeof report.overallScore !== 'number') return null;

  const contributions = penaltyContributions(ingredients);
  const total = contributions.reduce((a, b) => a + b, 0);
  const raw = Math.max(0, Math.min(100, Math.round(100 - total)));

  // Ingredient bites, biggest first. Named ones carry their real weighted
  // points; the last step absorbs rounding so the bites sum to 100 - raw.
  const ranked = contributions
    .map((points, index) => ({ points, index }))
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points);
  const named = ranked.filter((c) => c.points >= MIN_NAMED_POINTS).slice(0, NAMED_STEPS);
  const steps = [];
  let at = 100;
  for (const c of named) {
    const to = Math.max(raw, Math.round((at - c.points) * 10) / 10);
    steps.push({ kind: 'ingredient', name: ingredients[c.index].name, ingredientIndex: c.index, points: Math.round((at - to) * 10) / 10, from: at, to });
    at = to;
  }
  if (at > raw) {
    steps.push({ kind: 'others', count: ranked.length - named.length, points: Math.round((at - raw) * 10) / 10, from: at, to: raw });
    at = raw;
  } else if (steps.length) {
    steps[steps.length - 1].to = raw;
    at = raw;
  }

  const pushCap = (kind, to) => {
    if (to < at) { steps.push({ kind, points: at - to, from: at, to }); at = to; }
  };
  // computeScore's ingredient caps
  if (ingredients.some((i) => i.status === 'harmful')) pushCap('harmfulCap', squeezeToCap(at, ...SCORE_CAPS.harmful));
  else if (ingredients.some((i) => i.status === 'concerning')) pushCap('concerningCap', squeezeToCap(at, ...SCORE_CAPS.concerning));
  // applyRealNutrientCap (analyzeText.js): same squeeze, when a Quick Health Check exists
  if (report.dailyHabitCheck) pushCap('nutrientCap', squeezeToCap(at, ...SCORE_CAPS.concerning));
  // applyNutritionDensityCeiling (runs last): recorded on the report itself
  if (typeof report.overallScoreBeforeDensity === 'number' && report.overallScoreBeforeDensity === at) pushCap('densityCeiling', report.overallScore);

  if (at !== report.overallScore) return null;
  return { final: at, steps };
}
