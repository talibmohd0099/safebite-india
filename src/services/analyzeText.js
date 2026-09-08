// src/services/analyzeText.js
//
// The real analysis pipeline: parse the label -> resolve every ingredient
// against the shared database (researching only what's genuinely new) ->
// score it with plain rules. No whole-product AI call needed once
// ingredients are known.

import { parseLabel } from './ingredientParser.js';
import { resolveIngredients } from './ingredientLibrary.js';
import { buildReport } from './scoringEngine.js';

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
export async function analyzeText(rawText, productName) {
  const { ingredients: parsed, allergens } = parseLabel(rawText);

  if (parsed.length === 0) {
    throw new Error("Couldn't find any recognizable ingredients in that text. Please check and try again.");
  }

  const { ingredients, knownCount, researchedCount } = await resolveIngredients(parsed);

  if (ingredients.length === 0) {
    throw new Error("Couldn't research these ingredients right now. Please try again.");
  }

  const report = buildReport(ingredients, { productName });
  report.allergens = allergens;

  return {
    report,
    isIngredientOnly: parsed.length === 1,
    knownCount,
    researchedCount,
  };
}
