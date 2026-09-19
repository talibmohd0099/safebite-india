// src/services/compareProducts.js
//
// Pure logic -- no AI, no network. Turns 2-3 already-scored products
// (buildReport()'s output, the same shape History already stores) into
// a side-by-side comparison table plus a "what differs" sentence, so
// FoodGuard can answer "which of these fits me better", not just "is
// this one okay" one product at a time.

import { calculatePersonalAssessment } from './personalAssessment.js';

// The same "is this additive-heavy" signal personalAssessment.js's
// fewerAdditives priority already uses (a real INS/E code is the one
// thing an additive can be identified by with total confidence) --
// shown here as the raw count instead of a yes/no, since a table can
// carry more detail than a single priority check needs to.
function additivesCount(ingredients) {
  return (ingredients || []).filter((i) => i.insCode).length;
}

/**
 * One row per product -- everything the comparison table AND
 * describeDifferences() below both need, computed once. `activeProfile`
 * is optional; when given, each row also carries a personalScore next
 * to the universal one, same as the Result page's own personal layer.
 *
 * @param {object[]} products - buildReport() outputs (History entries
 *   already have this shape spread onto them).
 * @param {object|null} activeProfile - a Family profile, or null.
 */
export function buildComparisonRows(products, activeProfile = null) {
  return (products || []).map((p) => {
    const real = p.realNutrients || {};
    // Prefer "added sugar" (what the daily-habit check itself watches)
    // but fall back to total sugar -- most text/photo scans only ever
    // have the latter, and "no sugar data" would otherwise hide a real,
    // known number just because it wasn't broken out on this label.
    const sugarG = typeof real.addedSugarG === 'number' ? real.addedSugarG
      : typeof real.totalSugarG === 'number' ? real.totalSugarG
      : null;

    return {
      lookupKey: p.lookupKey || null,
      productName: p.productName || 'Unknown Product',
      imageUrl: p.imageUrl || null,
      overallScore: typeof p.overallScore === 'number' ? p.overallScore : null,
      personalScore: activeProfile ? calculatePersonalAssessment(p, activeProfile).personalScore : null,
      sugarG,
      sodiumMg: typeof real.sodiumMg === 'number' ? real.sodiumMg : null,
      proteinG: typeof real.proteinG === 'number' ? real.proteinG : null,
      additives: additivesCount(p.ingredients),
    };
  });
}

// How much of a real gap between the best- and worst-scoring product on
// one metric is worth naming -- a 3% sodium difference isn't a reason
// to prefer one product over another, it's noise from two different
// labels' rounding. 20% is a real, describable difference without being
// so strict that two genuinely similar products never get a sentence.
const MIN_RELATIVE_DIFFERENCE = 0.2;

// Only the direction that actually favours the higher-scoring product is
// ever described -- "X has more sodium than Y" while X still outscores
// Y would just mean sodium wasn't what decided the score here, which is
// exactly the kind of overclaim this function exists to avoid.
const METRICS = [
  { key: 'sodiumMg', lowerIsBetter: true, label: 'lower sodium' },
  { key: 'sugarG', lowerIsBetter: true, label: 'less sugar' },
  { key: 'additives', lowerIsBetter: true, label: 'fewer additive-related concerns' },
  { key: 'proteinG', lowerIsBetter: false, label: 'more protein' },
];

/**
 * A single deterministic sentence naming the 1-2 metrics with the
 * biggest REAL gap between the best- and worst-scoring product in the
 * comparison -- e.g. "Sunfeast Yippee has lower sodium and fewer
 * additive-related concerns than Maggi." Never a recommendation ("buy
 * X") -- purely a description of what the numbers already say, and
 * only when there IS a real number on both sides to compare (a missing
 * value never gets guessed at). Returns null when there's nothing
 * meaningful to describe (fewer than 2 scored products, or no metric
 * clears MIN_RELATIVE_DIFFERENCE).
 */
export function describeDifferences(rows) {
  const scoreOf = (r) => (typeof r.personalScore === 'number' ? r.personalScore : r.overallScore);
  const scored = (rows || []).filter((r) => typeof scoreOf(r) === 'number');
  if (scored.length < 2) return null;

  const sorted = [...scored].sort((a, b) => scoreOf(b) - scoreOf(a));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.lookupKey === worst.lookupKey || scoreOf(best) === scoreOf(worst)) return null;

  const diffs = [];
  for (const metric of METRICS) {
    const a = best[metric.key];
    const b = worst[metric.key];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (a === 0 && b === 0) continue;
    const base = Math.max(a, b, 1);
    const relativeDifference = Math.abs(a - b) / base;
    if (relativeDifference < MIN_RELATIVE_DIFFERENCE) continue;

    const bestIsBetter = metric.lowerIsBetter ? a < b : a > b;
    if (!bestIsBetter) continue;
    diffs.push({ metric, relativeDifference });
  }

  if (diffs.length === 0) return null;
  diffs.sort((x, y) => y.relativeDifference - x.relativeDifference);
  const top = diffs.slice(0, 2).map((d) => d.metric.label);
  const joined = top.length === 1 ? top[0] : `${top[0]} and ${top[1]}`;

  return `${best.productName} has ${joined} than ${worst.productName}.`;
}
