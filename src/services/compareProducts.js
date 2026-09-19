// src/services/compareProducts.js
//
// Pure logic -- no AI, no network. Turns 2-4 already-scored products
// (buildReport()'s output) into a side-by-side comparison table plus
// deterministic "what differs" bullets and a closing summary, so
// FoodGuard can answer "which of these fits me better", not just "is
// this one okay" one product at a time.

import { calculatePersonalAssessment, AVOID_PRIORITIES } from './personalAssessment.js';
import { getIngredientSeverity } from '../utils/storage.js';

// The same "is this additive-heavy" signal personalAssessment.js's
// fewerAdditives priority already uses (a real INS/E code is the one
// thing an additive can be identified by with total confidence).
function additivesCount(ingredients) {
  return (ingredients || []).filter((i) => i.insCode).length;
}

// Own judgment call, not an authoritative figure (same caveat every
// other threshold in personalAssessment.js carries) -- turns the raw
// count into the same plain-language buckets the reference design
// uses ("None"/"Few"/"Some"/"Several") instead of a bare number, since
// "3" reads very differently next to "0" than it does next to "8".
function additivesLabel(count) {
  if (count === 0) return 'None';
  if (count === 1) return 'Few';
  if (count <= 3) return 'Some';
  return 'Several';
}

// "How processed is this" -- the fraction of ingredients that AREN'T
// "Fine" on the exact same severity scale already shown on the
// Ingredients tab (getIngredientSeverity: Harmful/Concerning/Highly
// processed/Fine). Deliberately the broad "not Fine" definition, not
// just the narrow "Highly processed" tier alone -- checked against 79
// real noodle products first: most of what makes a product like Maggi
// read as heavily processed is ingredients tagged Concerning (flavour
// enhancers, certain oils), not the separate safe-but-penalized
// "Highly processed" bucket, so counting only that tier flatly showed
// "Low" for every real instant-noodle product tested, which defeats
// the point of the row. The fraction thresholds are this file's own
// judgment call (documented, not authoritative) -- calibrated so the
// same real sample split into a real spread (Low/Medium/High all
// populated) rather than everything landing in one bucket.
function processingLabel(ingredients) {
  const list = ingredients || [];
  if (list.length === 0) return null;
  const notFineCount = list.filter((i) => getIngredientSeverity(i).label !== 'Fine').length;
  const fraction = notFineCount / list.length;
  if (fraction >= 0.4) return 'High';
  if (fraction >= 0.15) return 'Medium';
  return 'Low';
}
const PROCESSING_RANK = { Low: 0, Medium: 1, High: 2 };

function numberOrNull(v) {
  return typeof v === 'number' ? v : null;
}

/**
 * One row per product -- everything the comparison table AND
 * describeDifferences() below both need, computed once. `activeProfile`
 * is optional; when given, each row also carries a personalScore and
 * the specific priorities this product tripped, same as the Result
 * page's own personal layer (calculatePersonalAssessment).
 *
 * @param {object[]} products - buildReport() outputs.
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
    const assessment = activeProfile ? calculatePersonalAssessment(p, activeProfile) : null;
    const additives = additivesCount(p.ingredients);

    return {
      lookupKey: p.lookupKey || null,
      productName: p.productName || 'Unknown Product',
      brand: p.brand || null,
      imageUrl: p.imageUrl || null,
      isInfantFormula: p.isInfantFormula === true,
      overallScore: numberOrNull(p.overallScore),
      personalScore: assessment ? assessment.personalScore : null,
      matchedConcerns: assessment ? assessment.matchedConcerns.map((c) => c.priorityKey) : [],
      // "caloriesKcal", not "energyKcal" -- matches the field name
      // personalAssessment.js's lowerCalories check, openFoodFacts.js
      // and blinkitProductsRepo.js all actually write into realNutrients
      // (confirmed by reading each). Getting this wrong here meant the
      // Energy row silently showed "--" for every real product, since
      // nothing was ever stored under the key this file was reading.
      energyKcal: numberOrNull(real.caloriesKcal),
      proteinG: numberOrNull(real.proteinG),
      totalCarbG: numberOrNull(real.totalCarbG),
      sugarG,
      totalFatG: numberOrNull(real.totalFatG),
      saturatedFatG: numberOrNull(real.saturatedFatG),
      sodiumMg: numberOrNull(real.sodiumMg),
      additives,
      additivesLabel: additivesLabel(additives),
      processing: processingLabel(p.ingredients),
    };
  });
}

/**
 * "Better"/"Lower"/"Moderate" (or the personal-score variant with " fit"
 * appended) for each product -- RELATIVE to the other products in THIS
 * comparison, not the absolute score tier. A 3-way comparison where
 * everyone scores "Moderate" on the app's own absolute scale should
 * still show who's relatively better or worse of the ones actually
 * being compared, same as the ranking already used to pick a "top
 * scorer" elsewhere in this file. Returns {} with fewer than 2 real
 * scores on `scoreKey` to compare.
 */
function relativeLabels(rows, scoreKey, labels) {
  const withScores = (rows || []).filter((r) => typeof r[scoreKey] === 'number');
  if (withScores.length < 2) return {};

  const best = Math.max(...withScores.map((r) => r[scoreKey]));
  const worst = Math.min(...withScores.map((r) => r[scoreKey]));
  const out = {};
  for (const r of withScores) {
    if (best === worst) out[r.lookupKey] = labels.moderate;
    else if (r[scoreKey] === best) out[r.lookupKey] = labels.better;
    else if (r[scoreKey] === worst) out[r.lookupKey] = labels.lower;
    else out[r.lookupKey] = labels.moderate;
  }
  return out;
}

/** Relative standing on the universal score, within this comparison only -- "Better" / "Moderate" / "Lower". */
export function scoreFitLabels(rows) {
  return relativeLabels(rows, 'overallScore', { better: 'Better', moderate: 'Moderate', lower: 'Lower' });
}

/** Relative standing on the personal score, within this comparison only -- "Better fit" / "Moderate fit" / "Lower fit". */
export function personalFitLabels(rows) {
  return relativeLabels(rows, 'personalScore', { better: 'Better fit', moderate: 'Moderate fit', lower: 'Lower fit' });
}

// How much of a real gap between the best- and worst-scoring product on
// one metric is worth naming -- a 3% sodium difference isn't a reason
// to prefer one product over another, it's noise from two different
// labels' rounding. 20% is a real, describable difference without being
// so strict that two genuinely similar products never get a bullet.
const MIN_RELATIVE_DIFFERENCE = 0.2;

// priorityKey ties each metric to the matching entry in
// personalAssessment.js's PRIORITIES -- used below to keep a metric the
// profile never asked to watch out of that SAME profile's "why is this
// the better fit" reasoning, even when the top-ranked product happens
// to also win on it.
const NUMERIC_METRICS = [
  { key: 'sugarG', unit: 'g', decimals: 1, lowerIsBetter: true, lowerLabel: 'lower sugar', higherLabel: 'more sugar', priorityKey: 'lowerSugar' },
  { key: 'sodiumMg', unit: 'mg', decimals: 0, lowerIsBetter: true, lowerLabel: 'lower sodium', higherLabel: 'more sodium', priorityKey: 'lowerSodium' },
  { key: 'saturatedFatG', unit: 'g', decimals: 1, lowerIsBetter: true, lowerLabel: 'less saturated fat', higherLabel: 'more saturated fat', priorityKey: 'lowerSatFat' },
  { key: 'energyKcal', unit: ' kcal', decimals: 0, lowerIsBetter: true, lowerLabel: 'fewer calories', higherLabel: 'more calories', priorityKey: 'lowerCalories' },
  { key: 'proteinG', unit: 'g', decimals: 1, lowerIsBetter: false, lowerLabel: 'less protein', higherLabel: 'more protein', priorityKey: 'higherProtein' },
];

const CONCERN_ENGLISH_LABEL = {
  lowerSugar: 'added sugar',
  lowerSodium: 'sodium',
  lowerSatFat: 'saturated fat',
  lessProcessed: 'processed ingredients',
  fewerAdditives: 'additive-related concerns',
  lowerCalories: 'calories',
};

function formatValue(v, metric) {
  const rounded = Number(v.toFixed(metric.decimals));
  return `${rounded}${metric.unit}`;
}

/**
 * The closing summary line, with a real product-picked-for-a-reason
 * conditional -- but its LABEL and its REASONING differ once a profile
 * is active, per a real bug a live test surfaced: with no profile,
 * "Our take" explains the universal score using ANY metric the winner
 * happens to win on. With a profile, that label becomes "For {name}"
 * and the reasoning is restricted to metrics the profile actually
 * SELECTED (and specifically the AVOID-type ones -- lowerSugar/
 * lowerSodium/lowerSatFat/lowerCalories -- since those are the only
 * ones that move personalScore at all; higherProtein/moreWholeFood are
 * informational-only by calculatePersonalAssessment's own design and
 * are deliberately not cited here as a numeric "why"). Three shapes:
 *   - every selected metric with real data favours the top pick: "X
 *     has the higher Personal Fit... mainly because it has A and B."
 *   - some favour the top pick, some favour the other: names both
 *     sides rather than overclaiming a clean win ("perform differently
 *     across {name}'s priorities...").
 *   - no selected metric had real data on both sides: falls back to
 *     whichever AVOID-type concern only the lower-scoring product
 *     tripped (same signal the bullets list already uses).
 */
function buildPersonalTake(rows, activeProfile) {
  const withPersonal = rows.filter((r) => typeof r.personalScore === 'number');
  if (withPersonal.length < 2) return null;

  const best = withPersonal.reduce((a, b) => (b.personalScore > a.personalScore ? b : a));
  const worst = withPersonal.reduce((a, b) => (b.personalScore < a.personalScore ? b : a));
  if (best.personalScore === worst.personalScore) {
    return `${activeProfile.nickname}'s selected priorities don't clearly favour one of these -- the table above is worth a closer look.`;
  }

  const selectedAvoidMetrics = NUMERIC_METRICS.filter(
    (m) => AVOID_PRIORITIES.has(m.priorityKey) && (activeProfile.priorities || []).includes(m.priorityKey)
  );

  const bestWins = [];
  const worstWins = [];
  for (const metric of selectedAvoidMetrics) {
    if (typeof best[metric.key] !== 'number' || typeof worst[metric.key] !== 'number') continue;
    if (best[metric.key] === worst[metric.key]) continue;
    const bestIsBetter = metric.lowerIsBetter ? best[metric.key] < worst[metric.key] : best[metric.key] > worst[metric.key];
    (bestIsBetter ? bestWins : worstWins).push(metric.lowerIsBetter ? metric.lowerLabel : metric.higherLabel);
  }

  const joinLabels = (labels) => (labels.length <= 1 ? labels[0] || '' : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`);

  if (bestWins.length > 0 && worstWins.length === 0) {
    return `${best.productName} has the higher Personal Fit for ${activeProfile.nickname}, mainly because it has ${joinLabels(bestWins)}.`;
  }

  if (bestWins.length > 0 && worstWins.length > 0) {
    return `The products perform differently across ${activeProfile.nickname}'s priorities: ${best.productName} has ${joinLabels(bestWins)}, while ${worst.productName} has ${joinLabels(worstWins)}.`;
  }

  // No selected AVOID-type metric had real data on both sides -- fall
  // back to whichever concern only the lower-scoring product tripped,
  // the same signal the "For {name}" bullet already uses.
  const bestConcerns = new Set(best.matchedConcerns);
  const worstOnlyConcerns = worst.matchedConcerns.filter((c) => !bestConcerns.has(c));
  const reason = worstOnlyConcerns.length > 0
    ? `due to fewer flagged ${CONCERN_ENGLISH_LABEL[worstOnlyConcerns[0]] || 'concerns'}`
    : "based on your priorities";
  return `${best.productName} has the higher Personal Fit for ${activeProfile.nickname} ${reason}.`;
}

/**
 * describeDifferences -- everything the "What differs?" callout and the
 * closing take line need, built from the same real numbers already on
 * each row. Never an AI call, so it can never invent a difference the
 * labels don't support, and never phrases anything as a command ("buy
 * X") -- every line either states a measured fact or a conditional
 * ("if choosing among these...").
 *
 * @returns {{ bullets: string[], take: { label: string, text: string }|null }}
 */
export function describeDifferences(rows, activeProfile = null) {
  const list = rows || [];
  const bullets = [];
  const winningMetrics = []; // tracks what favoured the top-scoring product, for ourTake

  const scoreOf = (r) => (typeof r.personalScore === 'number' ? r.personalScore : r.overallScore);
  const scored = list.filter((r) => typeof scoreOf(r) === 'number');
  const topProduct = scored.length >= 2
    ? [...scored].sort((a, b) => scoreOf(b) - scoreOf(a))[0]
    : null;

  if (list.length >= 2) {
    for (const metric of NUMERIC_METRICS) {
      const withData = list.filter((r) => typeof r[metric.key] === 'number');
      if (withData.length < 2) continue;

      const sorted = [...withData].sort((a, b) =>
        metric.lowerIsBetter ? a[metric.key] - b[metric.key] : b[metric.key] - a[metric.key]
      );
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best[metric.key] === worst[metric.key]) continue;

      const base = Math.max(Math.abs(best[metric.key]), Math.abs(worst[metric.key]), 1);
      const relativeDifference = Math.abs(best[metric.key] - worst[metric.key]) / base;
      if (relativeDifference < MIN_RELATIVE_DIFFERENCE) continue;

      bullets.push(
        `${best.productName} has ${metric.lowerIsBetter ? metric.lowerLabel : metric.higherLabel} ` +
        `(${formatValue(best[metric.key], metric)} vs ${formatValue(worst[metric.key], metric)}) than ${worst.productName}.`
      );
      if (topProduct && best.lookupKey === topProduct.lookupKey) {
        // A metric the profile never selected must never explain why
        // that SAME profile's top pick is the top pick, even when the
        // top-ranked product also happens to win on it (real bug found
        // via live testing: a profile with only "fewer additives" and
        // "prioritize protein" selected got "largely due to lower sugar
        // and lower sodium" in its own explanation -- neither was ever
        // asked for). No active profile means general score reasoning,
        // which has no priorities to restrict to.
        const relevantToProfile = !activeProfile || (activeProfile.priorities || []).includes(metric.priorityKey);
        if (relevantToProfile) winningMetrics.push(metric.lowerIsBetter ? metric.lowerLabel : metric.higherLabel);
      }
    }

    const withProcessing = list.filter((r) => r.processing);
    if (withProcessing.length >= 2) {
      const sorted = [...withProcessing].sort((a, b) => PROCESSING_RANK[b.processing] - PROCESSING_RANK[a.processing]);
      const mostProcessed = sorted[0];
      const leastProcessed = sorted[sorted.length - 1];
      if (PROCESSING_RANK[mostProcessed.processing] > PROCESSING_RANK[leastProcessed.processing]) {
        bullets.push(`${mostProcessed.productName} has the highest processing level among the ${withProcessing.length}.`);
      }
    }
  }

  if (activeProfile) {
    const withPersonal = list.filter((r) => typeof r.personalScore === 'number');
    if (withPersonal.length >= 2) {
      const best = withPersonal.reduce((a, b) => (b.personalScore > a.personalScore ? b : a));
      const worst = withPersonal.reduce((a, b) => (b.personalScore < a.personalScore ? b : a));
      if (best.personalScore > worst.personalScore) {
        const bestConcerns = new Set(best.matchedConcerns);
        const worstOnlyConcerns = worst.matchedConcerns.filter((c) => !bestConcerns.has(c));
        const reason = worstOnlyConcerns.length > 0
          ? `due to fewer flagged ${CONCERN_ENGLISH_LABEL[worstOnlyConcerns[0]] || 'concerns'}`
          : "based on your priorities";
        bullets.push(`For ${activeProfile.nickname}, ${best.productName} is a better fit ${reason}.`);
      }
    }
  }

  let take = null;
  if (activeProfile) {
    const text = buildPersonalTake(list, activeProfile);
    if (text) take = { label: `For ${activeProfile.nickname}`, text };
  } else if (scored.length >= 2) {
    const worstScore = Math.min(...scored.map(scoreOf));
    const text = scoreOf(topProduct) === worstScore
      ? "These are close enough in score that no single product clearly stands out -- the table above is worth a closer look for what matters most to you."
      : `If choosing among these, ${topProduct.productName} has the highest score${winningMetrics.length > 0 ? `, largely due to ${winningMetrics.slice(0, 2).join(' and ')}` : ''}.`;
    take = { label: 'Our take', text };
  }

  return { bullets, take };
}
