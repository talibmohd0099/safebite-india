// scripts/generate-reports.js
//
// Phase 2 of the seeding pipeline: turns raw rows already sitting in the
// `products` table (saved by scripts/discover-off-products.js) into real
// scored reports in product_reports, by running them through the app's
// own analysis pipeline (src/services/analyzeText.js) -- Gemini only for
// genuinely unknown ingredients and the one-line AI summary.
//
// Also processes the Blinkit/JioMart scrape backlog (blinkit_products,
// via scripts/scrape-blinkit.js / scrape-jiomart.js) through the exact
// same pipeline -- otherwise scraped rows would just sit in that staging
// table forever, never becoming a real, searchable product_reports row.
// Both backlogs share one combined per-run budget below.
//
// Kept as its own job, separate from discovery, because Gemini's
// free-tier rate limit is the only real bottleneck here. Previously,
// one overloaded/rate-limited product aborted the ENTIRE run -- every
// other company's products that had nothing to do with it, discarded
// too. Now every pending product is one shared queue: a stuck one is
// just skipped and retried next run, and if several fail in a row (a
// real outage, not a blip), the whole run stops early to save time --
// but nothing already working is lost, since the backlog itself never
// goes away between runs.
//
// Usage:
//   node scripts/generate-reports.js
//   node scripts/generate-reports.js --dry-run

import { analyzeText } from '../src/services/analyzeText.js';
import { isBundleListing } from '../src/services/bundleListing.js';
import { GEMINI_API_KEYS } from '../src/services/geminiService.js';
import { saveReport } from '../src/services/productCache.js';
import { getPendingProducts, markReportGenerated } from '../src/services/productsRepo.js';
import { getPendingBlinkitProducts, markBlinkitReportGenerated, blinkitLookupKey, extractNutrientsForHabitCheck } from '../src/services/blinkitProductsRepo.js';
import { isSupabaseConfigured } from '../src/services/supabaseClient.js';

// Proactive spacing, not just reacting to 429s. Calls now rotate across every
// configured key (see callGemini), so each key sees only 1/N of them -- the
// gap between products can shrink by the same factor.
const GEMINI_PACING_MS = Math.max(500, Math.round(1500 / Math.max(1, GEMINI_API_KEYS.length)));
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 30000; // Gemini's free-tier window is per-minute; 30s reliably clears it

// This job shares the same Gemini key as real users of the live app, who
// must always come first -- bounded per run, several runs/day still
// makes steady progress without needing this to be large.
const MAX_REPORTS_PER_RUN = 40;

// If this many products in a row fail for a Gemini reason, it's not a
// one-off blip -- it's today's free-tier cap or a longer overload spell,
// and every remaining product this run would likely fail the same way.
// Stop early rather than burn the rest of the run waiting it out; the
// backlog is untouched, so the next scheduled run just continues.
const MAX_CONSECUTIVE_TRANSIENT_FAILURES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Two different Gemini failure phrasings need the same treatment: a
// 429/quota message (rate limit or the daily free-tier cap) and a
// "currently experiencing high demand" / overloaded message (Gemini's
// wording for a temporary capacity issue, unrelated to any cap). Both
// are transient and worth retrying -- only a genuinely broken/unparseable
// product should be marked done and never retried.
function isTransientGeminiError(err) {
  return /quota|rate limit|429|high demand|overloaded|unavailable|503|internal error/i.test(err?.message || '');
}

/**
 * Returns { report, transient }. `report` is null on any failure.
 * `transient` tells the caller whether to leave this product unmarked
 * (worth retrying next run) or mark it done (a permanent failure, e.g.
 * unparseable text -- retrying forever would never succeed).
 */
async function generateWithRetry(product) {
  for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      const { report } = await analyzeText(
        product.ingredients_text,
        product.product_name,
        product.brand,
        product.off_ingredients,
        product.image_url,
        product.nutrients_info,
        product.pack_size
      );
      return { report, transient: false };
    } catch (err) {
      if (isTransientGeminiError(err)) {
        if (attempt < RATE_LIMIT_RETRIES) {
          console.warn(`  Gemini temporarily unavailable for "${product.product_name}" -- waiting ${RATE_LIMIT_WAIT_MS / 1000}s (attempt ${attempt}/${RATE_LIMIT_RETRIES}): ${err.message}`);
          await sleep(RATE_LIMIT_WAIT_MS);
          continue;
        }
        console.warn(`  Still failing after ${RATE_LIMIT_RETRIES} attempts for "${product.product_name}" -- leaving for next run: ${err.message}`);
        return { report: null, transient: true };
      }
      console.error(`  Skipped "${product.product_name}" (won't retry):`, err.message);
      return { report: null, transient: false };
    }
  }
  return { report: null, transient: true };
}

// blinkit_products has no lookup_key/off_ingredients columns of its own
// (Blinkit/JioMart expose their own product ids, not barcodes) -- shape
// each row the same as a productsRepo.js row plus a bound "mark done"
// callback, so the loop below can treat both backlogs identically
// without caring which table a given item actually came from.
function normalizeOffProduct(row) {
  return { ...row, markGenerated: () => markReportGenerated(row.lookup_key) };
}

function normalizeBlinkitProduct(row) {
  return {
    id: row.id,
    lookup_key: blinkitLookupKey(row.source, row.brand, row.product_name),
    source: row.source,
    product_name: row.product_name,
    brand: row.brand,
    ingredients_text: row.ingredients_text,
    off_ingredients: null,
    // Deliberately null, not row.image_url -- the standing decision is
    // to never use Blinkit's own product photos in the app (a
    // copyright/reuse-rights concern, not a technical one), so no
    // report built from here should ever end up with one as its
    // imageUrl, no matter what blinkit_products itself has stored.
    image_url: null,
    // The REAL per-serving amount (e.g. "200 ml"), not pack_size (the
    // whole pack/bottle, e.g. "2.25 ltr") -- see extractNutrientsForHabitCheck's
    // own doc comment for the real bug this fixes.
    nutrients_info: extractNutrientsForHabitCheck(row.nutrition, row.serving_size),
    pack_size: row.pack_size || null,
    markGenerated: () => markBlinkitReportGenerated(row.id),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  // Split the shared per-run budget across both backlogs so one source
  // with a long queue can't starve the other of a turn.
  const half = Math.ceil(MAX_REPORTS_PER_RUN / 2);
  const [offPending, blinkitPending] = await Promise.all([
    getPendingProducts(half),
    getPendingBlinkitProducts(MAX_REPORTS_PER_RUN - half),
  ]);
  const pending = [...offPending.map(normalizeOffProduct), ...blinkitPending.map(normalizeBlinkitProduct)];
  console.log(`Found ${offPending.length} OFF product(s) and ${blinkitPending.length} Blinkit/JioMart product(s) waiting for a report${dryRun ? ' (dry run)' : ''}.\n`);

  let generated = 0;
  let consecutiveTransientFailures = 0;

  for (const product of pending) {
    if (dryRun) {
      console.log(`  would generate: "${product.product_name || product.lookup_key}"`);
      continue;
    }

    // A gift pack/hamper/combo can't be scored honestly from one
    // ingredients field -- close it out with no report instead of
    // retrying it forever.
    if (isBundleListing(product.product_name)) {
      await product.markGenerated();
      continue;
    }

    const { report, transient } = await generateWithRetry(product);

    if (report) {
      await saveReport({
        lookupKey: product.lookup_key,
        source: product.source,
        productName: product.product_name,
        ingredientsText: product.ingredients_text,
        report,
      });
      await product.markGenerated();
      generated++;
      consecutiveTransientFailures = 0;
    } else if (transient) {
      consecutiveTransientFailures++;
      if (consecutiveTransientFailures >= MAX_CONSECUTIVE_TRANSIENT_FAILURES) {
        console.warn(`\nGemini has failed ${consecutiveTransientFailures} times in a row -- stopping this run early. Nothing is lost: the next scheduled run picks the backlog back up automatically.`);
        break;
      }
    } else {
      // Permanent failure (e.g. unparseable ingredients text) -- mark it
      // done so it doesn't sit in the backlog getting retried forever.
      await product.markGenerated();
      consecutiveTransientFailures = 0;
    }

    await sleep(GEMINI_PACING_MS);
  }

  console.log(`\nDone. Generated ${generated} new report(s).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
