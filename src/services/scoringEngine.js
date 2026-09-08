// src/services/scoringEngine.js
//
// Turns a resolved ingredient list into a full product report — score,
// verdict, flags, positives, recommendation, summary — using plain rules,
// not AI. This is what lets the ingredient library actually replace the
// per-product AI call once ingredients are known: no ingredients library
// service is any good if you still need an AI call to score the product.

const VERDICT_TIERS = [
  { min: 85, label: 'Very Healthy' },
  { min: 65, label: 'Good' },
  { min: 45, label: 'Moderate' },
  { min: 25, label: 'Poor' },
  { min: 0, label: 'Very Poor' },
];

function verdictFor(score) {
  return VERDICT_TIERS.find((t) => score >= t.min).label;
}

// A single harmful/banned ingredient must dominate the verdict — a pile
// of safe ingredients should never be able to dilute it into looking
// "moderate". Same idea, softer, for "concerning": it should never read
// as "Very Healthy" just because nothing else pulled the average down.
const HARMFUL_SCORE_CAP = 24;   // forces the "Very Poor" tier
const CONCERNING_SCORE_CAP = 64; // forces at most "Moderate"

// When a label states an ingredient's percentage, weight its penalty by
// how dominant it actually is in the product — a 68%-of-product ingredient
// should matter far more than a trace one carrying the same per-unit
// penalty. Unknown quantity (no % on the label) is left unweighted, since
// guessing would be worse than not adjusting at all.
function quantityWeight(ingredient) {
  if (typeof ingredient.percentage !== 'number') return 1;
  return 0.5 + (ingredient.percentage / 100) * 0.5; // ranges 0.5x (trace) to 1.0x (100%)
}

function computeScore(ingredients) {
  if (ingredients.length === 0) return 100;

  const totalPenalty = ingredients.reduce(
    (sum, ing) => sum + (ing.penalty || 0) * quantityWeight(ing),
    0
  );
  let score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

  if (ingredients.some((i) => i.status === 'harmful')) {
    score = Math.min(score, HARMFUL_SCORE_CAP);
  } else if (ingredients.some((i) => i.status === 'concerning')) {
    score = Math.min(score, CONCERNING_SCORE_CAP);
  }

  return score;
}

function recommendationFor(score) {
  if (score >= 85) return 'This is a healthy choice — enjoy without concern.';
  if (score >= 65) return 'A reasonably good choice, with only minor concerns to be aware of.';
  if (score >= 45) return "Fine occasionally, but not something to eat every day.";
  if (score >= 25) return 'Better treated as an occasional indulgence than a regular choice.';
  return 'Best avoided or eaten very rarely given its ingredient profile.';
}

/**
 * Build a full product report from resolved ingredients (the output of
 * ingredientLibrary.resolveIngredients). No AI call.
 */
export function buildReport(ingredients, { productName } = {}) {
  const score = computeScore(ingredients);
  const verdict = verdictFor(score);

  const harmful = ingredients.filter((i) => i.status === 'harmful');
  const concerning = ingredients.filter((i) => i.status === 'concerning');
  const safe = ingredients.filter((i) => i.status === 'safe');

  const flags = [...harmful, ...concerning]
    .sort((a, b) => (b.penalty || 0) - (a.penalty || 0))
    .slice(0, 6)
    .map((i) => i.name);

  const positives = [];
  if (ingredients.length > 0 && harmful.length === 0) positives.push('No FSSAI-banned ingredients');
  if (ingredients.some((i) => i.category)) {
    if (!ingredients.some((i) => i.category === 'color' && i.status !== 'safe')) {
      positives.push('No concerning artificial colors');
    }
    if (!ingredients.some((i) => i.category === 'sweetener' && i.status !== 'safe')) {
      positives.push('No artificial sweeteners');
    }
  }
  if (ingredients.length > 0 && safe.length === ingredients.length) {
    positives.push('All ingredients are considered safe');
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const summaryParts = [
    `This contains ${plural(ingredients.length, 'ingredient')}: ${safe.length} safe, ${concerning.length} concerning, ${harmful.length} harmful.`,
  ];
  if (harmful.length > 0) {
    summaryParts.push(
      `Notably, it contains ${harmful.map((i) => i.name).join(', ')}, flagged as harmful.`
    );
  } else if (concerning.length > 0) {
    summaryParts.push(`Main concerns: ${concerning.slice(0, 3).map((i) => i.name).join(', ')}.`);
  } else if (ingredients.length > 0) {
    summaryParts.push('No significant concerns were found.');
  }

  return {
    productName: productName || 'Unknown Product',
    overallScore: score,
    verdict,
    summary: summaryParts.join(' '),
    ingredients,
    flags,
    positives,
    recommendation: recommendationFor(score),
  };
}
