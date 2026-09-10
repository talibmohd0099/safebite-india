// scripts/seed-off-products.js
//
// Walks the Indian FMCG companies, pulls their real products from Open
// Food Facts, and runs each new one through the app's own analysis
// pipeline (src/services/analyzeText.js): parse -> resolve ingredients
// via Supabase (Gemini only for genuinely unknown ones) -> score ->
// save to product_reports.
//
// This used to be a Netlify Scheduled Function firing every minute. The
// Netlify site has been deleted, so this now runs as a GitHub Actions
// workflow instead (.github/workflows/seed-off-products.yml) -- same
// move already made for the Blinkit scraper, and for the same reason:
// a background job doesn't need a web host, and GitHub Actions is free
// on a public repo.
//
// Netlify's per-invocation time limit no longer applies, so unlike the
// old function (1-2 companies per minute), this walks every company in
// one run -- each only pulls one page (its next unprocessed page,
// tracked in seed_progress), so a full run is naturally bounded rather
// than needing an artificial per-run cap.
//
// Usage:
//   node scripts/seed-off-products.js
//   node scripts/seed-off-products.js --company "Britannia Industries"
//   node scripts/seed-off-products.js --dry-run

import { analyzeText } from '../src/services/analyzeText.js';
import { barcodeKey, saveReport } from '../src/services/productCache.js';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

const OFF_PAGE_SIZE = 20;
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_USER_AGENT = 'SafeBiteIndia-SeedJob/1.0 (+background product seeder)';
const REQUEST_GAP_MS = 1000; // be polite between companies
const GEMINI_PACING_MS = 2000; // between products, so a burst of new ones doesn't trip the per-minute limit
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 30000; // Gemini's free-tier window is per-minute; 30s reliably clears it

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

async function fetchPage(searchTerm, page) {
  const params = new URLSearchParams({
    search_terms: searchTerm,
    search_simple: '1',
    action: 'process',
    json: '1',
    page: String(page),
    page_size: String(OFF_PAGE_SIZE),
    countries_tags_en: 'India',
    fields: 'product_name,ingredients_text,code,brands,ingredients',
  });

  // Returns null on a failed request (network error, Open Food Facts
  // temporarily down) so the caller can tell that apart from a real
  // "zero results" response -- otherwise a transient hiccup gets
  // mistaken for "nothing left here" and permanently marks the company
  // exhausted after one bad network moment.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${OFF_SEARCH_URL}?${params.toString()}`, {
        headers: { 'User-Agent': OFF_USER_AGENT },
      });
      if (response.ok) {
        const data = await response.json();
        return data?.products ?? null;
      }
    } catch {
      // fall through and retry
    }
    if (attempt < 3) await sleep(attempt * 1200);
  }
  return null;
}

async function getProgress(company) {
  const { data, error } = await supabase.from('seed_progress').select('*').eq('company', company).maybeSingle();
  if (error) {
    console.warn(`[seed] Could not read progress for ${company}:`, error.message);
  }
  return data || { company, next_page: 1, exhausted: false, products_saved: 0 };
}

async function saveProgress(progress) {
  const { error } = await supabase
    .from('seed_progress')
    .upsert({ ...progress, updated_at: new Date().toISOString() }, { onConflict: 'company' });
  if (error) console.warn('[seed] Could not save progress:', error.message);
}

function isRateLimitError(err) {
  return /quota|rate limit|429/i.test(err?.message || '');
}

/**
 * A rate-limited product isn't a real failure -- it's the same product,
 * a bit later. Skipping it outright would silently lose it forever,
 * since the page cursor advances regardless of individual product
 * outcomes. Waits out Gemini's per-minute window and retries instead.
 */
async function analyzeWithRetry(product, companyName) {
  for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      const { report } = await analyzeText(product.ingredients_text, product.product_name, primaryBrand(product.brands), product.ingredients);
      return report;
    } catch (err) {
      if (isRateLimitError(err) && attempt < RATE_LIMIT_RETRIES) {
        console.warn(`  Rate-limited on "${product.product_name}" (${companyName}) -- waiting ${RATE_LIMIT_WAIT_MS / 1000}s (attempt ${attempt}/${RATE_LIMIT_RETRIES})...`);
        await sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }
      console.error(`  Skipped "${product.product_name}" (${companyName}):`, err.message);
      return null;
    }
  }
  return null;
}

async function runCompany(target, dryRun) {
  const progress = await getProgress(target.company);

  if (progress.exhausted) {
    console.log(`  ${target.company}: fully seeded already (${progress.products_saved} saved). Skipping.`);
    return;
  }

  const products = await fetchPage(target.searchTerm, progress.next_page);

  if (products === null) {
    console.warn(`  ${target.company}: Open Food Facts request failed -- will retry page ${progress.next_page} next run.`);
    return;
  }

  if (products.length === 0) {
    if (!dryRun) await saveProgress({ ...progress, exhausted: true });
    console.log(`  ${target.company}: no more products on page ${progress.next_page} -- marking exhausted.`);
    return;
  }

  const candidates = products.filter((p) => p.code && p.product_name && looksLikeValidIngredients(p.ingredients_text));

  let existing = new Set();
  if (candidates.length > 0 && !dryRun) {
    const codes = candidates.map((p) => barcodeKey(p.code));
    const { data } = await supabase.from('product_reports').select('lookup_key').in('lookup_key', codes);
    existing = new Set((data || []).map((r) => r.lookup_key));
  }

  let saved = 0;
  for (const product of candidates) {
    const key = barcodeKey(product.code);
    if (existing.has(key)) continue;

    if (dryRun) {
      console.log(`  ${target.company}: would analyze "${product.product_name}"`);
      saved++;
      continue;
    }

    const report = await analyzeWithRetry(product, target.company);
    if (report) {
      await saveReport({
        lookupKey: key,
        source: 'barcode',
        productName: product.product_name,
        ingredientsText: product.ingredients_text,
        report,
      });
      saved++;
    }

    await sleep(GEMINI_PACING_MS); // proactive pacing, not just reacting to 429s
  }

  const isLastPage = products.length < OFF_PAGE_SIZE;
  if (!dryRun) {
    await saveProgress({
      company: target.company,
      next_page: progress.next_page + 1,
      exhausted: isLastPage,
      products_saved: progress.products_saved + saved,
    });
  }

  console.log(`  ${target.company} page ${progress.next_page}: saved ${saved} new product(s), ${existing.size} already known.`);
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

  console.log(`Walking ${targets.length} compan${targets.length === 1 ? 'y' : 'ies'}${dryRun ? ' (dry run)' : ''}.\n`);

  for (const target of targets) {
    await runCompany(target, dryRun);
    await sleep(REQUEST_GAP_MS);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
