// scripts/discover-off-products.js
//
// Phase 1 of the seeding pipeline: walks Open Food Facts by FOOD
// CATEGORY (biscuits, snacks, beverages, ...) rather than by brand name,
// and saves the raw facts (name, brand, ingredients text, image) into
// the `products` table (supabase/products_schema.sql). No AI, no
// scoring -- that's scripts/generate-reports.js's job, running as its
// own separate GitHub Actions workflow.
//
// This used to walk a fixed list of ~42 Indian FMCG brand names instead.
// That worked at first, but it's a hard ceiling by construction -- every
// brand's real catalog on Open Food Facts is finite, and once all of
// them hit "no more pages," growth stops completely regardless of how
// much more India-tagged food actually exists there (it does: e.g.
// categories_tags:"en:snacks" alone returns 1000+ India-tagged products,
// several times the total this pipeline had collected across all 42
// brands combined). Category tags aren't tied to a brand list at all,
// so this doesn't hit that same wall, and it picks up smaller/regional
// brands the old list never had a search term for.
//
// This used to do discovery AND report generation in one script. Gemini
// was the only slow, rate-limited part of that -- and a single
// overloaded/rate-limited product could abort the ENTIRE run, including
// every other category's products that had nothing to do with it. Since
// this script never touches Gemini at all, that failure mode is gone
// here by construction, and discovery can run through the whole
// category list quickly and reliably every time.
//
// Product discovery and ingredient detail are two separate Open Food
// Facts calls (see discoverPage/fetchProductDetail below) -- the old
// legacy search.pl did both at once but measured directly only
// succeeded ~33% of the time. Splitting them keeps the reliable part
// (per-barcode detail lookup, already used for live scans) reliable,
// and moves discovery onto Open Food Facts' newer search API instead.
//
// Usage:
//   node scripts/discover-off-products.js
//   node scripts/discover-off-products.js --category "Snacks"
//   node scripts/discover-off-products.js --dry-run

import { barcodeKey } from '../src/services/productCache.js';
import { existingLookupKeys, saveProduct } from '../src/services/productsRepo.js';
import { isSupabaseConfigured, supabase } from '../src/services/supabaseClient.js';

const OFF_PAGE_SIZE = 20;
// Discovery ("which India products exist in this category") and detail
// ("what are this barcode's ingredients") are deliberately two different
// endpoints. The legacy cgi/search.pl did both in one call, but measured
// directly it only succeeded ~33% of the time (503s the rest). The
// newer search-a-licious API (search.openfoodfacts.org) tested reliably
// for discovery; it doesn't return ingredients, so detail still comes
// from the same v2 per-barcode endpoint src/services/openFoodFacts.js
// already uses for live scans -- the part of this pipeline that was
// never flaky.
const OFF_DISCOVERY_URL = 'https://search.openfoodfacts.org/search';
const OFF_DETAIL_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_USER_AGENT = 'SafeBiteIndia-SeedJob/1.0 (+background product seeder)';
const REQUEST_GAP_MS = 500; // be polite between categories
const OFF_DETAIL_GAP_MS = 300; // polite spacing between per-product detail fetches
const OFF_DISCOVERY_RETRIES = 6; // discovery has shown real, if occasional, instability
const OFF_DETAIL_RETRIES = 3; // detail has been fully reliable in testing; kept modest, not zero

// No Gemini in this script at all, so this is bounded only by how many
// OFF requests fit in the job's timeout, which is generous.
const MAX_PRODUCTS_PER_RUN = 300;

// Real Open Food Facts category tags, India-tagged product counts
// verified live before adding any of these (a handful of plausible-
// looking ones -- en:sweets, en:namkeens, en:papads, en:ready-meals --
// turned out to return zero and were left out rather than added as dead
// weight, same discipline the old brand list used).
const CATEGORIES = [
  { category: 'Biscuits', tag: 'en:biscuits' },
  { category: 'Snacks', tag: 'en:snacks' },
  { category: 'Beverages', tag: 'en:beverages' },
  { category: 'Chocolates', tag: 'en:chocolates' },
  { category: 'Spices', tag: 'en:spices' },
  { category: 'Dairies', tag: 'en:dairies' },
  { category: 'Instant noodles', tag: 'en:instant-noodles' },
  { category: 'Chips and fries', tag: 'en:chips-and-fries' },
  { category: 'Salty snacks', tag: 'en:salty-snacks' },
  { category: 'Cereals and potatoes', tag: 'en:cereals-and-potatoes' },
  { category: 'Breakfast cereals', tag: 'en:breakfast-cereals' },
  { category: 'Sauces', tag: 'en:sauces' },
  { category: 'Condiments', tag: 'en:condiments' },
  { category: 'Vegetable oils', tag: 'en:vegetable-oils' },
  { category: 'Flours', tag: 'en:flours' },
  { category: 'Rices', tag: 'en:rices' },
  { category: 'Pastas', tag: 'en:pastas' },
  { category: 'Teas', tag: 'en:teas' },
  { category: 'Coffees', tag: 'en:coffees' },
  { category: 'Ice creams', tag: 'en:ice-creams' },
  { category: 'Breads', tag: 'en:breads' },
  { category: 'Cakes', tag: 'en:cakes' },
  { category: 'Candies', tag: 'en:candies' },
  { category: 'Pickles', tag: 'en:pickles' },
  { category: 'Soups', tag: 'en:soups' },
  { category: 'Milks', tag: 'en:milks' },
  { category: 'Cheeses', tag: 'en:cheeses' },
  { category: 'Yogurts', tag: 'en:yogurts' },
  { category: 'Butters', tag: 'en:butters' },
];

// Being crowdsourced, some Open Food Facts entries have nutrition facts
// mistakenly saved in the ingredients field instead of real ingredients.
// Same check src/services/openFoodFacts.js uses for barcode scans.
const NUTRITION_ONLY_WORDS = new Set([
  'energy', 'protein', 'carbohydrate', 'carbohydrates', 'fat', 'fats',
  'fibre', 'fiber', 'sodium', 'calories', 'kcal', 'sugar', 'sugars', 'cholesterol',
]);

function looksLikeValidIngredients(text) {
  const cleaned = (text || '').trim();
  if (cleaned.length < 40) return false;

  const words = cleaned.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;

  const nutritionWordCount = words.filter((w) => NUTRITION_ONLY_WORDS.has(w.toLowerCase())).length;
  if (!cleaned.includes(',') && nutritionWordCount / words.length > 0.5) return false;

  return true;
}

// Open Food Facts' "brands" field is sometimes a messy comma-separated
// tag list (e.g. "Sunfeast, Sunfeast is sold by ITC Limited") -- take
// just the first, cleanest-looking entry as the brand to show.
function primaryBrand(brandsField) {
  if (!brandsField) return null;
  const first = brandsField.split(',')[0].trim();
  return first || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns null on a failed request (network error, Open Food Facts
 * temporarily down) so the caller can tell that apart from a real
 * "zero results" response -- otherwise a transient hiccup gets mistaken
 * for "nothing left here" and permanently marks the category exhausted
 * after one bad network moment.
 */
async function fetchJsonWithRetries(url, retries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': OFF_USER_AGENT } });
      if (response.ok) return await response.json();
    } catch {
      // fall through and retry
    }
    if (attempt < retries) await sleep(attempt * 1200);
  }
  return null;
}

/**
 * Discovery: which India-tagged products exist in this category. Returns
 * only identifying fields (code, name, brand) -- search-a-licious
 * doesn't index ingredients, so those come from fetchProductDetail()
 * below, once we already know this product is worth fetching.
 */
async function discoverPage(tag, page) {
  const params = new URLSearchParams({
    q: `categories_tags:"${tag}" AND countries_tags:"en:india"`,
    page: String(page),
    page_size: String(OFF_PAGE_SIZE),
    langs: 'en',
    fields: 'code,product_name,brands',
  });

  const data = await fetchJsonWithRetries(`${OFF_DISCOVERY_URL}?${params.toString()}`, OFF_DISCOVERY_RETRIES);
  return data?.hits ?? null;
}

/** Detail: the actual ingredients for one product, by barcode. */
async function fetchProductDetail(code) {
  const params = new URLSearchParams({ fields: 'product_name,ingredients_text,code,brands,ingredients,image_front_url' });
  const data = await fetchJsonWithRetries(`${OFF_DETAIL_URL}/${encodeURIComponent(code)}.json?${params.toString()}`, OFF_DETAIL_RETRIES);
  return data?.product ?? null;
}

async function getProgress(category) {
  const { data, error } = await supabase.from('seed_progress').select('*').eq('company', category).maybeSingle();
  if (error) {
    console.warn(`[discover] Could not read progress for ${category}:`, error.message);
  }
  return data || { company: category, next_page: 1, exhausted: false, products_saved: 0 };
}

async function saveProgress(progress) {
  const { error } = await supabase
    .from('seed_progress')
    .upsert({ ...progress, updated_at: new Date().toISOString() }, { onConflict: 'company' });
  if (error) console.warn('[discover] Could not save progress:', error.message);
}

// Thrown to stop the whole run early and cleanly -- caught in main(),
// never bubbles up as a real crash.
class StopRunSignal extends Error {}

async function runCategory(target, dryRun, budget) {
  const progress = await getProgress(target.category);

  if (progress.exhausted) {
    console.log(`  ${target.category}: fully seeded already (${progress.products_saved} saved). Skipping.`);
    return;
  }

  const hits = await discoverPage(target.tag, progress.next_page);

  if (hits === null) {
    console.warn(`  ${target.category}: Open Food Facts request failed -- will retry page ${progress.next_page} next run.`);
    return;
  }

  if (hits.length === 0) {
    if (!dryRun) await saveProgress({ ...progress, exhausted: true });
    console.log(`  ${target.category}: no more products on page ${progress.next_page} -- marking exhausted.`);
    return;
  }

  // Discovery alone already gives us the barcode, so check what we
  // already have BEFORE spending a detail-fetch request on it -- no
  // point looking up full details for a product we'd skip anyway.
  // Products often carry more than one category tag, so this is also
  // what keeps the same product from being re-saved once per category
  // it happens to belong to.
  let existing = new Set();
  if (!dryRun) {
    const codes = hits.filter((h) => h.code).map((h) => barcodeKey(h.code));
    if (codes.length > 0) existing = await existingLookupKeys(codes);
  }

  let saved = 0;
  let stoppedEarly = false;
  for (const hit of hits) {
    if (!hit.code) continue;
    const key = barcodeKey(hit.code);
    if (existing.has(key)) continue;

    if (dryRun) {
      console.log(`  ${target.category}: would save "${hit.product_name || hit.code}"`);
      saved++;
      continue;
    }

    if (budget.remaining <= 0) {
      console.log(`  ${target.category}: hit this run's ${MAX_PRODUCTS_PER_RUN}-product cap -- stopping here, resuming next run.`);
      stoppedEarly = true;
      break;
    }

    const detail = await fetchProductDetail(hit.code);
    await sleep(OFF_DETAIL_GAP_MS);
    if (!detail || !looksLikeValidIngredients(detail.ingredients_text)) continue;

    await saveProduct({
      lookupKey: key,
      source: 'barcode',
      productName: detail.product_name,
      brand: primaryBrand(detail.brands),
      ingredientsText: detail.ingredients_text,
      offIngredients: detail.ingredients,
      imageUrl: detail.image_front_url,
    });
    budget.remaining--;
    saved++;
  }

  // Only advance the page cursor / mark exhausted on a clean, complete
  // pass -- if we bailed early (hit the cap), leave next_page untouched
  // so this exact page gets retried next run instead of silently losing
  // whatever wasn't reached yet.
  if (!dryRun && !stoppedEarly) {
    const isLastPage = hits.length < OFF_PAGE_SIZE;
    await saveProgress({
      company: target.category,
      next_page: progress.next_page + 1,
      exhausted: isLastPage,
      products_saved: progress.products_saved + saved,
    });
  } else if (saved > 0) {
    // Still record whatever we did manage to save, just without moving
    // the page forward or touching "exhausted".
    await saveProgress({ ...progress, products_saved: progress.products_saved + saved });
  }

  console.log(`  ${target.category} page ${progress.next_page}: saved ${saved} new product(s), ${existing.size} already known.${stoppedEarly ? ' (stopped early)' : ''}`);

  if (stoppedEarly) throw new StopRunSignal('Run budget reached.');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const categoryIdx = args.indexOf('--category');
  const onlyCategory = categoryIdx !== -1 ? args[categoryIdx + 1] : null;

  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  const targets = onlyCategory ? CATEGORIES.filter((c) => c.category === onlyCategory) : CATEGORIES;
  if (targets.length === 0) {
    console.error(`No category matching "${onlyCategory}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`Walking ${targets.length} categor${targets.length === 1 ? 'y' : 'ies'}${dryRun ? ' (dry run)' : ''}, up to ${MAX_PRODUCTS_PER_RUN} new products this run.\n`);

  const budget = { remaining: MAX_PRODUCTS_PER_RUN };

  for (const target of targets) {
    try {
      await runCategory(target, dryRun, budget);
    } catch (err) {
      if (err instanceof StopRunSignal) {
        console.log('\nStopping the run here rather than continuing to the remaining categories -- next scheduled run picks back up cleanly.');
        break;
      }
      throw err;
    }
    await sleep(REQUEST_GAP_MS);
  }

  console.log('\nDone. Run scripts/generate-reports.js (its own workflow) to turn newly-saved products into reports.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
