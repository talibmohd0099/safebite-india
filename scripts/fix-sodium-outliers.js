// scripts/fix-sodium-outliers.js
//
// One-off, verified fix for the sodium-unit-mismatch bug just fixed in
// openFoodFacts.js's extractNutrientsForHabitCheck (see its own comment):
// some Open Food Facts entries have the milligram figure typed straight
// into sodium_100g, a field OFF's schema defines as grams. Existing rows
// scraped BEFORE that fix still carry the corrupted value baked in --
// this re-fetches each affected barcode's LIVE OFF data through the now-
// fixed extractor and only touches a row when that live re-check actually
// confirms a fix (never guesses, never applies an arbitrary divisor).
//
// Scope, deliberately narrow: only the sodium field, and only barcode-
// sourced rows (Blinkit-sourced high-sodium readings were independently
// checked against Blinkit's own raw scraped text and found to genuinely
// match what Blinkit's page says -- not a bug this fix addresses).
//
// After fixing sodium, recomputes dailyHabitCheck + the score's nutrient
// cap from the corrected number (using the report's OWN already-resolved
// ingredients -- never re-researches anything), so a score that was only
// low because of the corrupted sodium reading is corrected too. Nothing
// else about the report (summary, story, ingredients, foodType) changes.
//
// Usage:
//   node scripts/fix-sodium-outliers.js                 (dry run)
//   node scripts/fix-sodium-outliers.js --write

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { lookupBarcode } from '../src/services/openFoodFacts.js';
import { toServing } from '../src/services/nutrientBasis.js';
import { buildDailyHabitCheck, isSmallPortionFood } from '../src/services/dailyHabitCheck.js';
import { buildReport, applyRealNutrientCap } from '../src/services/scoringEngine.js';
import { applyNutritionDensityCeiling } from '../src/services/nutritionDensity.js';

// The exact barcode-sourced report ids flagged by the earlier audit
// (physically-impossible sodium, >10,000mg per 100g) -- re-checked here
// against live OFF data, not re-guessed.
const REPORT_IDS = [
  '6a9b6c9f-8f04-4b96-b0a2-43b88b9769ff', // yippee noodles (ITC)
  '28422ce7-c2d7-4991-849e-34f8093d06d1', // Yippee noodles (snack pack)
  'ce6e0eb1-45ed-4a21-afb7-31bf74455621', // Whoopies
  '4976e37c-353f-4495-bf94-7635e737fe07', // Hyderabadi biryani
  'af760a87-d2f4-4f0d-9f08-12fa92d8f871', // Kissan Sweet & Spicy Sauce
  'ac3d5180-c249-4709-95cc-91d9ef110be6', // Kissan No onion no garlic Ketchup
  '34470e1a-130c-4175-ad1d-42d1f437865d', // Horlicks
  '9d5ba7d9-aa03-4c47-b7de-a0f6730c1137', // POTATO WAFERS
  'f0813032-d394-4f18-b5ff-eb9aea4f1232', // Kissan Fresh Tomato Ketchup
  '6074cc7f-148a-445d-be0d-6d24581cba52', // Everyday 100% whole wheat bread
  '77b53ba2-406e-4ef1-a657-7d7d5ca6ba3f', // Britannia Marie Gold
  '18b29efd-1325-48f7-b180-dd322755bebb', // Marie light
  '8e2813be-4076-4d27-a0b2-c1f83f56c5ca', // Jimjam 57g
  '3881091b-26d9-4b1b-bd45-11fad698e6d1', // bourbon
  '3a454871-22ba-4854-910f-a56b55490019', // Kit kat
  '076a6e08-3a97-4d2c-a248-a07125efefee', // Chocolate Milkshake
  '02345c61-f44b-4b06-b0b4-f301230db8a5', // Jeera Khakhra
  '0b033828-6605-491d-b8f8-aa9d639c1074', // YogaBar Muesli+
  '57da4c5e-4eca-4ffc-adc7-78a18b2a6a58', // Himalayan Rock Salt
  'dd8bd9d7-d50a-482a-92b6-a7644a9774ac', // Chikki Bar
  'e1ccdbd5-e8ab-4fa5-9b27-6f599fd9b151', // Salt LITE
  'c7d1f639-b7b2-4b81-afcc-4bf8d4ee6e12', // Palm Candy Sukku Coffee
  'a3eb533f-8580-4853-8107-6004943b801b', // Navratan mix
  'ff7fd3d3-3ca7-4ba6-9286-fe48b974babb', // Everest Pani Puri Masala
  'a4b4aed4-457f-4de7-8993-3c691595f9c3', // everest Chaat Masala
  '61dac764-d901-4cb9-bf5d-af7dafb465e9', // Cardamom Seed Powder
  '531a6c65-7011-4285-8934-2d0ba55a433c', // catch chat masala
  'd9722793-24f0-4fbf-8ce5-9825804a9924', // iodized salt
  '048a2e25-5361-4648-bcae-5936caa34c50', // Mysore Rasam Powder
  'db15d7cd-8042-4cf4-b3ae-092a8e5149d0', // Maggi masala magic
  '46313ddc-7abd-4409-8cf2-31f7e142b045', // Sprite Lemon Lime 2ltr
  'cd381435-5974-44d5-a2a2-7ee884de5492', // Tata Sampann Chaat Masala
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A single fetch failure (rate limit, transient network blip) isn't the
// same as "this barcode has no OFF data" -- confirmed live: Kit Kat and
// Sprite both failed once mid-run here and both had real data on retry.
// Only a genuinely malformed/unknown barcode should end up "no data".
async function lookupWithRetry(barcode, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await lookupBarcode(barcode);
      if (result?.found) return result;
      return result; // a real, clean "not found" -- no point retrying
    } catch (err) {
      if (i === attempts) return { found: false, error: err.message };
      await sleep(1500 * i);
    }
  }
  return { found: false };
}

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}. Checking ${REPORT_IDS.length} products against LIVE Open Food Facts data.\n`);

  let fixed = 0, unchanged = 0, noOffData = 0, notActuallyFixed = 0;

  for (const id of REPORT_IDS) {
    const { data: row, error } = await supabase.from('product_reports').select('id, product_name, lookup_key, report').eq('id', id).maybeSingle();
    if (error || !row) { console.warn(`  SKIP ${id}: could not load row (${error?.message || 'not found'})`); continue; }

    const barcode = row.lookup_key?.startsWith('barcode:') ? row.lookup_key.slice('barcode:'.length) : null;
    if (!barcode) { console.warn(`  SKIP ${row.product_name}: not a barcode row`); continue; }

    const found = await lookupWithRetry(barcode);
    await sleep(600); // polite pacing against OFF's API

    const oldSodium = row.report?.nutrientsPer100?.sodiumMg;
    const freshSodium = found?.found ? found.nutrientsInfo?.nutrientsPer100?.sodiumMg : undefined;

    if (!found?.found || typeof freshSodium !== 'number') {
      console.log(`  NO OFF DATA  ${row.product_name}  (old: ${oldSodium}mg) -- leaving untouched, needs manual review`);
      noOffData++;
      continue;
    }

    if (Math.abs(freshSodium - (oldSodium ?? -1)) < 0.5) {
      console.log(`  UNCHANGED    ${row.product_name}  -- OFF still reports ${freshSodium}mg (same as stored; not a unit-mismatch case)`);
      unchanged++;
      continue;
    }

    if (freshSodium > 10000) {
      console.log(`  STILL HIGH   ${row.product_name}  ${oldSodium}mg -> ${freshSodium}mg -- genuinely high per OFF, not applying (needs manual review, e.g. wrong barcode match)`);
      notActuallyFixed++;
      continue;
    }

    // A fresh reading of exactly 0 for something flagged as absurdly HIGH
    // is more likely "OFF has no real data for this product at all" than
    // a genuine zero -- confirmed live for Everest Pani Puri Masala: its
    // whole OFF panel is degenerate (17kcal/100g for a dry masala powder,
    // implausible on its own), not just sodium. Applying the sodium fix
    // alone there would trade one wrong number for a differently wrong
    // one. Never trust a 0 in isolation -- check the rest of the fresh
    // panel actually looks like real data for a dry product first.
    if (freshSodium === 0) {
      const freshCals = found.nutrientsInfo?.nutrientsPer100?.caloriesKcal;
      if (typeof freshCals !== 'number' || freshCals < 30) {
        console.log(`  SUSPECT DATA ${row.product_name}  OFF gives sodium 0mg AND implausible calories (${freshCals}kcal/100g) -- this product's whole OFF entry looks unreliable, not applying, needs manual review`);
        notActuallyFixed++;
        continue;
      }
    }

    // Confirmed fix -- rebuild the sodium-dependent parts of the report
    // from the CORRECTED number, reusing the report's own already-
    // resolved ingredients (nothing about the ingredient list changed).
    const report = row.report;
    const servingGrams = report.realNutrientsServingGrams ?? null;
    const servingUnit = report.realNutrientsServingUnit || 'g';

    const nextReport = {
      ...report,
      nutrientsPer100: { ...report.nutrientsPer100, sodiumMg: freshSodium },
      realNutrients: {
        ...report.realNutrients,
        sodiumMg: toServing({ sodiumMg: freshSodium }, servingGrams).sodiumMg,
      },
    };

    const eligible = !nextReport.isCondimentOrSeasoning && !nextReport.isInfantFormula
      && !isSmallPortionFood(nextReport.productName, servingGrams);
    const habitCheck = eligible ? buildDailyHabitCheck(nextReport.realNutrients, servingGrams, servingUnit) : null;
    if (habitCheck) nextReport.dailyHabitCheck = habitCheck; else delete nextReport.dailyHabitCheck;

    // Recompute the score from a clean ingredient-only baseline, then
    // reapply the exact same caps analyzeText.js applies on a fresh scan
    // -- undoes any score suppression the corrupted sodium reading caused,
    // without touching anything the AI wrote (summary/recommendation/story).
    if (Array.isArray(report.ingredients) && report.ingredients.length > 0) {
      const baseline = buildReport(report.ingredients, {
        productName: report.productName, brand: report.brand, imageUrl: report.imageUrl, packSize: report.packSize,
      });
      nextReport.overallScore = baseline.overallScore;
      nextReport.verdict = baseline.verdict;
      delete nextReport.overallScoreBeforeDensity;
      delete nextReport.nutritionDensity;
      delete nextReport.scoreNote;
      if (habitCheck) applyRealNutrientCap(nextReport, habitCheck);
      if (nextReport.foodType) applyNutritionDensityCeiling(nextReport);
    }

    console.log(`  FIXED        ${row.product_name}  sodium ${oldSodium}mg -> ${freshSodium}mg/100g  |  score ${report.overallScore} -> ${nextReport.overallScore}`);
    fixed++;

    if (write) {
      const { error: writeError } = await supabase.from('product_reports').update({ report: nextReport, updated_at: new Date().toISOString() }).eq('id', id);
      if (writeError) console.warn(`    could not save: ${writeError.message}`);
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, unchanged (OFF matches stored): ${unchanged}, still-high (needs manual review): ${notActuallyFixed}, no OFF data: ${noOffData}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
