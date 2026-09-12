// src/services/analyzeText.js
//
// The real analysis pipeline: parse the label -> resolve every ingredient
// against the shared database (researching only what's genuinely new) ->
// score it with plain rules. No whole-product AI call needed once
// ingredients are known.

import { parseLabel, isBracketBalanced } from './ingredientParser.js';
import { resolveIngredients } from './ingredientLibrary.js';
import { buildReport } from './scoringEngine.js';
import { generateProductInsights, repairLabelPunctuation } from './geminiService.js';
import { applyOffPercentEstimates } from './openFoodFacts.js';
import { estimateQuantities } from './quantityEstimator.js';

/**
 * Analyze raw ingredients text end to end.
 *
 * Returns { report, isIngredientOnly, knownCount, researchedCount }.
 *
 * isIngredientOnly is true when the text parsed down to a single
 * ingredient (e.g. someone searching "INS 102" or "Tartrazine" directly)
 * rather than a real multi-ingredient product — callers should treat this
 * as an ingredient lookup, not a product scan, and skip saving it to the
 * shared product cache (the ingredient itself is already cached in the
 * ingredients table, so caching it again as a "product" is redundant).
 */
export async function analyzeText(rawText, productName, brand, offIngredients, imageUrl) {
  // Only for parsing -- the caller keeps showing the user their real,
  // original scanned/typed text regardless of what happens here.
  let textToParse = rawText;
  if (!isBracketBalanced(rawText)) {
    const repaired = await repairLabelPunctuation(rawText);
    if (repaired) textToParse = repaired;
  }

  const { ingredients: parsed, allergens } = parseLabel(textToParse);

  if (parsed.length === 0) {
    throw new Error("Couldn't find any recognizable ingredients in that text. Please check and try again.");
  }

  // When we have Open Food Facts' structured per-ingredient breakdown
  // (barcode-sourced only), fill in real percentages it estimated for
  // ingredients the label itself doesn't state one for -- more accurate
  // than the category-based default quantityWeight() falls back to.
  const enrichedParsed = offIngredients?.length
    ? applyOffPercentEstimates(parsed, offIngredients)
    : parsed;

  // Whatever still has no percentage gets one estimated from its position
  // in the list (labels are ordered by descending weight), so scoring
  // stops treating a trailing spice as a full-strength component.
  const withQuantities = estimateQuantities(enrichedParsed);

  const { ingredients, knownCount, researchedCount } = await resolveIngredients(withQuantities);

  if (ingredients.length === 0) {
    throw new Error("Couldn't research these ingredients right now. Please try again.");
  }

  // A single-ingredient search (e.g. someone typing a random word or a
  // typo) isn't a real product -- if Gemini itself couldn't recognize it
  // as a food ingredient at all, don't fabricate a score/verdict for it.
  // A genuinely unfamiliar ingredient *within* a real multi-ingredient
  // product still gets scored -- this only applies when it's the only
  // thing being looked up.
  if (parsed.length === 1 && ingredients[0].recognized === false) {
    throw new Error(`"${ingredients[0].name}" doesn't look like a real food ingredient. Please check the spelling and try again.`);
  }

  const report = buildReport(ingredients, { productName, brand, imageUrl });
  report.allergens = allergens;

  // Single-ingredient lookups don't need "product" text at all -- only
  // worth the extra call for a real multi-ingredient product.
  if (parsed.length > 1) {
    const insights = await generateProductInsights({
      productName: report.productName,
      brand,
      score: report.overallScore,
      verdict: report.verdict,
      harmfulNames: ingredients.filter((i) => i.status === 'harmful').map((i) => i.name),
      concerningNames: ingredients.filter((i) => i.status === 'concerning').map((i) => i.name),
      ingredientCount: ingredients.length,
      ingredientNames: ingredients.map((i) => i.name),
    });
    // Each field falls back independently to the rule-based version
    // already on `report` -- a failed call (or a partial response) must
    // never break the report or blank out a section.
    if (insights?.summary) report.summary = insights.summary;
    if (insights?.recommendation) report.recommendation = insights.recommendation;
    if (insights?.isCondimentOrSeasoning) report.isCondimentOrSeasoning = true;
  }

  return {
    report,
    isIngredientOnly: parsed.length === 1,
    knownCount,
    researchedCount,
  };
}
