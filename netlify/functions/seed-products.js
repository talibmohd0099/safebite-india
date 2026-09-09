// netlify/functions/seed-products.js
//
// Background job: every minute, picks one Indian FMCG company (round
// robin, driven by the clock so it needs no extra state), pulls the next
// page of its real products from Open Food Facts, and runs each new one
// through the exact same pipeline the app already uses for a live scan
// (src/services/analyzeText.js): parse the label -> resolve every
// ingredient against the shared Supabase ingredient library (Gemini is
// only called for ingredients nobody has ever seen before, batched into
// one call per product) -> score it -> save to product_reports.
//
// Result: the app's shared cache fills up on its own in the background,
// using your existing Gemini + Supabase keys, no per-run manual step.
//
// Netlify's shortest allowed schedule is once a minute. The literal cron
// string below is how Netlify finds that at deploy time (it's read
// statically, so it can't be a variable).

import { schedule } from '@netlify/functions';
import { supabase, isSupabaseConfigured } from '../../src/services/supabaseClient.js';
import { analyzeText } from '../../src/services/analyzeText.js';
import { barcodeKey, saveReport } from '../../src/services/productCache.js';

// Stay well under Netlify's function execution limit -- if we're not done
// with a page in time, we just pick it back up next run.
const TIME_BUDGET_MS = 8000;
const OFF_PAGE_SIZE = 20;
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_USER_AGENT = 'SafeBiteIndia-SeedJob/1.0 (+background product seeder)';

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

// Open Food Facts' "brands" field is sometimes a messy comma-separated
// tag list (e.g. "Sunfeast, Sunfeast is sold by ITC Limited") -- take
// just the first, cleanest-looking entry as the brand to show.
function primaryBrand(brandsField) {
  if (!brandsField) return null;
  const first = brandsField.split(',')[0].trim();
  return first || null;
}

function looksLikeValidIngredients(text) {
  const cleaned = (text || '').trim();
  if (cleaned.length < 40) return false;

  const words = cleaned.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;

  const nutritionWordCount = words.filter((w) => NUTRITION_ONLY_WORDS.has(w.toLowerCase())).length;
  if (!cleaned.includes(',') && nutritionWordCount / words.length > 0.5) return false;

  return true;
}

// No stored "whose turn is it" pointer needed -- the clock decides, so a
// skipped/delayed invocation just costs that one company its turn, never
// gets the whole rotation stuck.
function pickCompanyForThisRun() {
  const slot = Math.floor(Date.now() / 60000);
  return COMPANIES[slot % COMPANIES.length];
}

async function getProgress(company) {
  const { data, error } = await supabase.from('seed_progress').select('*').eq('company', company).maybeSingle();
  if (error) {
    console.warn('[seed] Could not read seed_progress (has supabase/seed_progress_schema.sql been run yet?):', error.message);
  }
  return data || { company, next_page: 1, exhausted: false, products_saved: 0 };
}

async function saveProgress(progress) {
  const { error } = await supabase
    .from('seed_progress')
    .upsert({ ...progress, updated_at: new Date().toISOString() }, { onConflict: 'company' });
  if (error) {
    console.warn('[seed] Could not save seed_progress (has supabase/seed_progress_schema.sql been run yet?):', error.message);
  }
}

async function fetchPage(searchTerm, page) {
  const params = new URLSearchParams({
    search_terms: searchTerm,
    search_simple: '1',
    action: 'process',
    json: '1',
    page: String(page),
    page_size: String(OFF_PAGE_SIZE),
    countries_tags_en: 'India',
    fields: 'product_name,ingredients_text,code,brands',
  });

  // Returns null on a failed request (network error, Open Food Facts
  // temporarily down) so the caller can tell that apart from a real
  // "zero results" response -- otherwise a transient hiccup gets
  // mistaken for "nothing left here" and permanently marks the company
  // exhausted after one bad network moment.
  try {
    const response = await fetch(`${OFF_SEARCH_URL}?${params.toString()}`, {
      headers: { 'User-Agent': OFF_USER_AGENT },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.products ?? null;
  } catch {
    return null;
  }
}

// Flip to false to resume. While true, the function still fires on
// schedule (Netlify's dashboard will keep showing it as active) but does
// nothing -- no Open Food Facts requests, no Gemini calls, no writes.
const SEED_PAUSED = true;

export const handler = schedule('* * * * *', async () => {
  if (SEED_PAUSED) {
    console.log('[seed] Paused -- set SEED_PAUSED to false in netlify/functions/seed-products.js to resume.');
    return { statusCode: 200 };
  }

  if (!isSupabaseConfigured) {
    console.error('[seed] Supabase is not configured -- set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in Netlify env vars.');
    return { statusCode: 200 };
  }

  const startedAt = Date.now();
  const target = pickCompanyForThisRun();
  const progress = await getProgress(target.company);

  if (progress.exhausted) {
    console.log(`[seed] ${target.company}: already fully seeded (${progress.products_saved} products saved so far). Nothing to do this run.`);
    return { statusCode: 200 };
  }

  const products = await fetchPage(target.searchTerm, progress.next_page);

  if (products === null) {
    console.warn(`[seed] ${target.company}: Open Food Facts request failed this run -- will retry page ${progress.next_page} next time.`);
    return { statusCode: 200 };
  }

  if (products.length === 0) {
    await saveProgress({ ...progress, exhausted: true });
    console.log(`[seed] ${target.company}: no more products on page ${progress.next_page} -- marking exhausted.`);
    return { statusCode: 200 };
  }

  const candidates = products.filter((p) => p.code && p.product_name && looksLikeValidIngredients(p.ingredients_text));

  let existing = new Set();
  if (candidates.length > 0) {
    const codes = candidates.map((p) => barcodeKey(p.code));
    const { data } = await supabase.from('product_reports').select('lookup_key').in('lookup_key', codes);
    existing = new Set((data || []).map((r) => r.lookup_key));
  }

  let saved = 0;
  let processedAll = true;

  for (const product of candidates) {
    const key = barcodeKey(product.code);
    if (existing.has(key)) continue;

    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      processedAll = false; // ran out of time -- stay on this page next run
      break;
    }

    try {
      const { report } = await analyzeText(product.ingredients_text, product.product_name, primaryBrand(product.brands));
      await saveReport({
        lookupKey: key,
        source: 'barcode',
        productName: product.product_name,
        ingredientsText: product.ingredients_text,
        report,
      });
      saved++;
    } catch (err) {
      console.error(`[seed] Skipped "${product.product_name}" (${target.company}):`, err.message);
    }
  }

  const isLastPage = products.length < OFF_PAGE_SIZE;
  await saveProgress({
    company: target.company,
    next_page: processedAll ? progress.next_page + 1 : progress.next_page,
    exhausted: processedAll && isLastPage,
    products_saved: progress.products_saved + saved,
  });

  console.log(`[seed] ${target.company} page ${progress.next_page}: saved ${saved} new product(s), ${existing.size} already known.`);

  return { statusCode: 200 };
});
