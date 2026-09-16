// src/services/analyzeText.js
//
// The real analysis pipeline: parse the label -> resolve every ingredient
// against the shared database (researching only what's genuinely new) ->
// score it with plain rules. No whole-product AI call needed once
// ingredients are known.

import { parseLabel, isBracketBalanced, looksLikeNutritionPanel } from './ingredientParser.js';
import { resolveIngredients } from './ingredientLibrary.js';
import { buildReport, applyRealNutrientCap } from './scoringEngine.js';
import { generateProductInsights, repairLabelPunctuation } from './geminiService.js';
import { translateReportToHindi } from './translateService.js';
import { applyOffPercentEstimates } from './openFoodFacts.js';
import { estimateQuantities } from './quantityEstimator.js';
import { buildDailyHabitCheck, isSmallPortionFood } from './dailyHabitCheck.js';

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
 *
 * nutrientsInfo (optional) -- real, already-known nutrition-panel
 * numbers for this exact product ({ nutrients, servingLabel }, see
 * openFoodFacts.js / blinkitProductsRepo.js), used only to power the
 * "if this became a daily habit" projection. Never estimated -- when a
 * caller has no real numbers for a product (e.g. pasted/photographed
 * text with no nutrition panel), it's simply omitted and that section
 * doesn't appear.
 */
export async function analyzeText(rawText, productName, brand, offIngredients, imageUrl, nutrientsInfo) {
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

  // Checked here, before resolveIngredients -- a photographed nutrition
  // panel is cheap to spot from the parsed names alone, and catching it
  // now avoids paying Gemini to research "Energy" and "Carbohydrate" as
  // if they were ingredients. See looksLikeNutritionPanel for the real
  // scan this came from and why the "mostly unrecognized" guard below
  // can't catch it.
  if (looksLikeNutritionPanel(parsed)) {
    throw new Error('That looks like the nutrition panel rather than the ingredients list. Please capture the list that starts with "Ingredients".');
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

  // A real product's ingredient list is virtually never MOSTLY things
  // Gemini can't recognize as food at all -- a real but obscure regional
  // ingredient still comes back recognized (see the prompt in
  // geminiService.js), so at least half unrecognized means the source
  // text almost certainly wasn't a real ingredients list to begin with.
  // Found via a real seeded product (Taj Mahal tea) whose "ingredients"
  // were things like "Rusbea Verified Environment" and "Org 00 8
  // 901030 658778" -- a certification blurb and a barcode, scraped from
  // the wrong field -- which each individually resolved as harmless
  // (nothing to penalize), so the product scored a false 100/100.
  // Scoring text like that as if it were a clean product would be
  // actively misleading.
  //
  // Uses >= rather than a strict majority (> 0.5) -- a real scanned
  // product (Fortune brand Refined Sunflower Oil, barcode
  // 8906035030239) had a photographed label with no real ingredients
  // panel at all, just front-of-pack marketing copy ("Freedom to eat,
  // Freedom to enjoy..."). That parsed down to exactly two fragments:
  // one Gemini correctly flagged as a marketing phrase (recognized:
  // false), the other a garbled "E Freedom Refined Sunflower Oil
  // Freedom To Eat" that Gemini charitably matched to real sunflower
  // oil (recognized: true) by pattern-matching the one legitimate
  // phrase buried inside the noise. A strict "> 0.5" let that exact
  // 50/50 split through, scoring the product 95/100 on a fabricated
  // ingredient. With so few total fragments, a tied split is already
  // too unreliable a sample to trust either way.
  const unrecognized = ingredients.filter((i) => i.recognized === false);
  if (parsed.length > 1 && unrecognized.length / ingredients.length >= 0.5) {
    const examples = unrecognized.slice(0, 3).map((i) => `"${i.name}"`).join(', ');
    throw new Error(`This doesn't look like a real ingredients list — a large share of what was found (${examples}) isn't a recognized food ingredient. Please check the text and try again.`);
  }

  const report = buildReport(ingredients, { productName, brand, imageUrl });
  report.allergens = allergens;

  // Real, already-published nutrition-panel numbers (Open Food Facts or
  // Blinkit -- see their extractNutrientsForHabitCheck), persisted
  // as-is so Personal FoodGuard's priority matching (personalAssessment.js)
  // can reuse them later, not just at the moment of this one analysis.
  // Kept regardless of isCondimentOrSeasoning below -- that only changes
  // whether the "daily habit" FRAMING makes sense for a masala eaten a
  // pinch at a time, not whether the underlying real numbers are valid.
  if (nutrientsInfo?.nutrients) {
    report.realNutrients = nutrientsInfo.nutrients;
    report.realNutrientsServingGrams = nutrientsInfo.servingGrams ?? null;
  }

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
    if (insights?.usefulContext) report.usefulContext = insights.usefulContext;
    if (insights?.story) report.story = insights.story;

    // A masala scoring 95 isn't eaten by the spoonful -- the same reason
    // isCondimentOrSeasoning already changes how the score itself reads
    // means a "here's what a daily habit of this looks like" framing
    // would be actively misleading for one, so it's skipped entirely.
    if (nutrientsInfo && !report.isCondimentOrSeasoning && !isSmallPortionFood(report.productName, nutrientsInfo.servingGrams)) {
      const habitCheck = buildDailyHabitCheck(nutrientsInfo.nutrients, nutrientsInfo.servingGrams);
      if (habitCheck) {
        report.dailyHabitCheck = habitCheck;
        // A real nutrient number worth showing in the Quick Health
        // Check section is also worth reflecting in the score itself --
        // see applyRealNutrientCap in scoringEngine.js.
        applyRealNutrientCap(report, habitCheck);
      }
    }

    // Hindi translation of everything above -- a completely separate
    // service/quota from Gemini, so it's safe to always attempt (falls
    // back to English on any failure, never blocks the report).
    const hi = await translateReportToHindi(report);
    if (hi) report.hi = hi;
  }

  return {
    report,
    isIngredientOnly: parsed.length === 1,
    knownCount,
    researchedCount,
  };
}
