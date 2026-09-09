// src/services/analyzeText.js
//
// The real analysis pipeline: parse the label -> resolve every ingredient
// against the shared database (researching only what's genuinely new) ->
// score it with plain rules. No whole-product AI call needed once
// ingredients are known.

import { parseLabel } from './ingredientParser.js';
import { resolveIngredients } from './ingredientLibrary.js';
import { buildReport } from './scoringEngine.js';
import { generateSummary } from './geminiService.js';
import { applyOffPercentEstimates } from './openFoodFacts.js';

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
export async function analyzeText(rawText, productName, brand, offIngredients) {
  const { ingredients: parsed, allergens } = parseLabel(rawText);

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

  const { ingredients, knownCount, researchedCount } = await resolveIngredients(enrichedParsed);

  if (ingredients.length === 0) {
    throw new Error("Couldn't research these ingredients right now. Please try again.");
  }

  const report = buildReport(ingredients, { productName, brand });
  report.allergens = allergens;

  // Single-ingredient lookups don't need a "product" summary at all --
  // only worth the extra call for a real multi-ingredient product.
  if (parsed.length > 1) {
    const aiSummary = await generateSummary({
      productName: report.productName,
      brand,
      score: report.overallScore,
      verdict: report.verdict,
      harmfulNames: ingredients.filter((i) => i.status === 'harmful').map((i) => i.name),
      concerningNames: ingredients.filter((i) => i.status === 'concerning').map((i) => i.name),
      ingredientCount: ingredients.length,
    });
    // Falls back to the rule-based summary already on `report` if this
    // AI call fails for any reason -- never let it break the report.
    if (aiSummary) report.summary = aiSummary;
  }

  return {
    report,
    isIngredientOnly: parsed.length === 1,
    knownCount,
    researchedCount,
  };
}
