// scripts/discover-off-products.js
//
// Phase 1 of the seeding pipeline: walks the Indian FMCG companies,
// pulls their real products from Open Food Facts, and saves the raw
// facts (name, brand, ingredients text, image) into the `products`
// table (supabase/products_schema.sql). No AI, no scoring -- that's
// scripts/generate-reports.js's job, running as its own separate
// GitHub Actions workflow.
//
// This used to do discovery AND report generation in one script. Gemini
// was the only slow, rate-limited part of that -- and a single
// overloaded/rate-limited product could abort the ENTIRE run, including
// every other company's products that had nothing to do with it. Since
// this script never touches Gemini at all, that failure mode is gone
// here by construction, and discovery can run through the whole company
// list quickly and reliably every time.
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
//   node scripts/discover-off-products.js --company "Britannia Industries"
//   node scripts/discover-off-products.js --dry-run

import { barcodeKey } from '../src/services/productCache.js';
import { existingLookupKeys, saveProduct } from '../src/services/productsRepo.js';
import { isSupabaseConfigured, supabase } from '../src/services/supabaseClient.js';

const OFF_PAGE_SIZE = 20;
// Discovery ("which India products exist for this brand") and detail
// ("what are this barcode's ingredients") are deliberately two different
// endpoints. The legacy cgi/search.pl did both in one call, but measured
// directly it only succeeded ~33% of the time (503s the rest). The
// newer search-a-licious API (search.openfoodfacts.org) tested 5/5 for
// discovery; it doesn't return ingredients, so detail still comes from
// the same v2 per-barcode endpoint src/services/openFoodFacts.js already
// uses for live scans -- the part of this pipeline that was never flaky.
const OFF_DISCOVERY_URL = 'https://search.openfoodfacts.org/search';
const OFF_DETAIL_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_USER_AGENT = 'SafeBiteIndia-SeedJob/1.0 (+background product seeder)';
const REQUEST_GAP_MS = 500; // be polite between companies
const OFF_DETAIL_GAP_MS = 300; // polite spacing between per-product detail fetches
const OFF_DISCOVERY_RETRIES = 6; // discovery has shown real, if occasional, instability
const OFF_DETAIL_RETRIES = 3; // detail has been fully reliable in testing; kept modest, not zero

// No Gemini in this script at all, so the old 25-per-run cap (sized
// around Gemini pacing) doesn't apply -- this is now bounded only by how
// many OFF requests fit in the job's timeout, which is generous.
const MAX_PRODUCTS_PER_RUN = 300;

// Major Indian FMCG food companies/brands, matched against Open Food Facts.
// Add more here any time -- nothing else needs to change.
const COMPANIES = [
  { company: 'Britannia Industries', searchTerm: 'Britannia' },
  { company: 'Parle Products', searchTerm: 'Parle' },
  { company: 'ITC Sunfeast', searchTerm: 'Sunfeast' },
  { company: 'ITC Bingo', searchTerm: 'Bingo' },
  { company: 'ITC Aashirvaad', searchTerm: 'Aashirvaad' },
  { company: 'Nestle India Maggi', searchTerm: 'Maggi' },
  { company: 'Nestle India KitKat', searchTerm: 'KitKat' },
  { company: "Haldiram's", searchTerm: "Haldiram's" },
  { company: 'Amul (GCMMF)', searchTerm: 'Amul' },
  { company: 'MTR Foods', searchTerm: 'MTR' },
  { company: 'Dabur India', searchTerm: 'Dabur' },
  { company: 'Patanjali Ayurved', searchTerm: 'Patanjali' },
  { company: 'Marico Saffola', searchTerm: 'Saffola' },
  { company: 'HUL Kissan', searchTerm: 'Kissan' },
  { company: 'HUL Knorr', searchTerm: 'Knorr' },
  { company: 'HUL Bru', searchTerm: 'Bru' },
  { company: 'Mondelez Cadbury', searchTerm: 'Cadbury' },
  { company: "PepsiCo Lay's", searchTerm: "Lay's" },
  { company: 'PepsiCo Kurkure', searchTerm: 'Kurkure' },
  { company: 'Bikaji Foods', searchTerm: 'Bikaji' },
  { company: 'Mother Dairy', searchTerm: 'Mother Dairy' },
  { company: 'Everest Spices', searchTerm: 'Everest masala' },
  { company: 'MDH Spices', searchTerm: 'MDH' },
  { company: 'Tata Sampann', searchTerm: 'Tata Sampann' },
  { company: 'Adani Wilmar Fortune', searchTerm: 'Fortune oil' },

  // Added once discovery ran out of new products for every company
  // above -- every one of them was showing "fully seeded already" with
  // nothing left to find, so growth had genuinely stalled, not just
  // slowed. These are real, distinct Indian FMCG brands not already
  // covered by a search term above, verified to actually return
  // India-tagged hits on Open Food Facts before adding (a few obvious
  // candidates -- Del Monte, Top Ramen, India Gate, Too Yumm, Act II,
  // Wai Wai, Paper Boat, Ching's Secret -- turned out to have zero
  // entries there at all, a real coverage gap in OFF's crowdsourced
  // data, not a search-term bug, so left out rather than added as dead
  // weight).
  { company: 'Priyagold', searchTerm: 'Priyagold' },
  { company: 'ITC Yippee', searchTerm: 'Yippee' },
  { company: 'Parle Agro Frooti', searchTerm: 'Frooti' },
  { company: 'Parle Agro Appy', searchTerm: 'Appy' },
  { company: 'Gits Foods', searchTerm: 'Gits' },
  { company: 'Bambino Agro', searchTerm: 'Bambino' },
  { company: 'Weikfield Foods', searchTerm: 'Weikfield' },
  { company: 'Catch Foods', searchTerm: 'Catch' },
  { company: 'Kohinoor Foods', searchTerm: 'Kohinoor' },
  { company: 'LT Foods Daawat', searchTerm: 'Daawat' },
  { company: 'HUL Horlicks', searchTerm: 'Horlicks' },
  { company: 'Mondelez Bournvita', searchTerm: 'Bournvita' },
  { company: 'Zydus Complan', searchTerm: 'Complan' },
  { company: 'Agro Tech Sundrop', searchTerm: 'Sundrop' },
  { company: 'Rasna', searchTerm: 'Rasna' },
  { company: 'Vadilal Industries', searchTerm: 'Vadilal' },
  { company: 'Danone Epigamia', searchTerm: 'Epigamia' },
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
 * for "nothing left here" and permanently marks the company exhausted
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
 * Discovery: which India-tagged products exist for this brand. Returns
 * only identifying fields (code, name, brand) -- search-a-licious
 * doesn't index ingredients, so those come from fetchProductDetail()
 * below, once we already know this product is worth fetching.
 */
async function discoverPage(searchTerm, page) {
  const params = new URLSearchParams({
    q: `${searchTerm} AND countries_tags:"en:india"`,
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

async function getProgress(company) {
  const { data, error } = await supabase.from('seed_progress').select('*').eq('company', company).maybeSingle();
  if (error) {
    console.warn(`[discover] Could not read progress for ${company}:`, error.message);
  }
  return data || { company, next_page: 1, exhausted: false, products_saved: 0 };
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

async function runCompany(target, dryRun, budget) {
  const progress = await getProgress(target.company);

  if (progress.exhausted) {
    console.log(`  ${target.company}: fully seeded already (${progress.products_saved} saved). Skipping.`);
    return;
  }

  const hits = await discoverPage(target.searchTerm, progress.next_page);

  if (hits === null) {
    console.warn(`  ${target.company}: Open Food Facts request failed -- will retry page ${progress.next_page} next run.`);
    return;
  }

  if (hits.length === 0) {
    if (!dryRun) await saveProgress({ ...progress, exhausted: true });
    console.log(`  ${target.company}: no more products on page ${progress.next_page} -- marking exhausted.`);
    return;
  }

  // Discovery alone already gives us the barcode, so check what we
  // already have BEFORE spending a detail-fetch request on it -- no
  // point looking up full details for a product we'd skip anyway.
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
      console.log(`  ${target.company}: would save "${hit.product_name || hit.code}"`);
      saved++;
      continue;
    }

    if (budget.remaining <= 0) {
      console.log(`  ${target.company}: hit this run's ${MAX_PRODUCTS_PER_RUN}-product cap -- stopping here, resuming next run.`);
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
      company: target.company,
      next_page: progress.next_page + 1,
      exhausted: isLastPage,
      products_saved: progress.products_saved + saved,
    });
  } else if (saved > 0) {
    // Still record whatever we did manage to save, just without moving
    // the page forward or touching "exhausted".
    await saveProgress({ ...progress, products_saved: progress.products_saved + saved });
  }

  console.log(`  ${target.company} page ${progress.next_page}: saved ${saved} new product(s), ${existing.size} already known.${stoppedEarly ? ' (stopped early)' : ''}`);

  if (stoppedEarly) throw new StopRunSignal('Run budget reached.');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyIdx = args.indexOf('--company');
  const onlyCompany = companyIdx !== -1 ? args[companyIdx + 1] : null;

  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  const targets = onlyCompany ? COMPANIES.filter((c) => c.company === onlyCompany) : COMPANIES;
  if (targets.length === 0) {
    console.error(`No company matching "${onlyCompany}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`Walking ${targets.length} compan${targets.length === 1 ? 'y' : 'ies'}${dryRun ? ' (dry run)' : ''}, up to ${MAX_PRODUCTS_PER_RUN} new products this run.\n`);

  const budget = { remaining: MAX_PRODUCTS_PER_RUN };

  for (const target of targets) {
    try {
      await runCompany(target, dryRun, budget);
    } catch (err) {
      if (err instanceof StopRunSignal) {
        console.log('\nStopping the run here rather than continuing to the remaining companies -- next scheduled run picks back up cleanly.');
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
