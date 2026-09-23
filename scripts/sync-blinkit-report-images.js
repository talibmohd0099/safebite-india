// scripts/sync-blinkit-report-images.js
//
// A real gap this closes: blinkit_products.optimized_image_url has been
// backfilled for most already-scraped rows, but a report SAVED BEFORE
// its own product got optimized keeps whatever imageUrl was in its
// report JSON at the moment it was generated forever after -- updating
// the raw table later never reaches back into an already-saved report.
// This just copies the optimized_image_url that's ALREADY SITTING THERE
// into report.imageUrl wherever the two disagree. No downloading, no
// re-processing -- purely a data sync, so it's fast and safe to re-run.
//
// Usage:
//   node scripts/sync-blinkit-report-images.js            (dry run)
//   node scripts/sync-blinkit-report-images.js --write
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { blinkitLookupKey } from '../src/services/blinkitProductsRepo.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The background scrape loop is hammering the same tables with writes
// while this reads -- a real "canceling statement due to statement
// timeout" was seen live under that load. Retries, not a bigger
// timeout: the transient contention passes within a few seconds either
// way, and a smaller page size (below) means less work wasted per hit.
async function withRetry(fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    const result = await fn();
    if (!result.error) return result;
    if (i === attempts || !/timeout/i.test(result.error.message)) return result;
    await sleep(2000 * i);
  }
}

const PAGE_SIZE = 300;

async function loadBlinkitOptimizedUrls() {
  const map = new Map(); // lookup_key -> optimized_image_url
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() =>
      supabase
        .from('blinkit_products')
        .select('product_name, brand, source, optimized_image_url')
        .not('optimized_image_url', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      map.set(blinkitLookupKey(row.source, row.brand, row.product_name), row.optimized_image_url);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return map;
}

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  console.log('Loading already-optimized Blinkit images...');
  const optimizedByKey = await loadBlinkitOptimizedUrls();
  console.log(`${optimizedByKey.size} blinkit_products row(s) have an optimized image.\n`);

  let checked = 0, stale = 0, upToDate = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() =>
      supabase
        .from('product_reports')
        .select('id, lookup_key, product_name, report')
        .eq('source', 'blinkit')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );
    if (error) { console.error(error.message); process.exitCode = 1; return; }
    if (!data?.length) break;

    for (const row of data) {
      checked++;
      const optimizedUrl = optimizedByKey.get(row.lookup_key);
      if (!optimizedUrl) continue; // nothing better available yet -- scripts/optimize-blinkit-images.js handles this case

      if (row.report?.imageUrl === optimizedUrl) { upToDate++; continue; }

      stale++;
      console.log(`  ${row.product_name}`);
      if (write) {
        const { error: updateError } = await supabase
          .from('product_reports')
          .update({ report: { ...row.report, imageUrl: optimizedUrl } })
          .eq('id', row.id);
        if (updateError) console.warn(`    could not save: ${updateError.message}`);
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\nChecked ${checked} Blinkit reports. ${upToDate} already up to date. ${stale} ${write ? 'synced' : 'would be synced'}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
