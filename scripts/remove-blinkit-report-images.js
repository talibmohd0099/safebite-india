// scripts/remove-blinkit-report-images.js
//
// The standing decision is to stop using Blinkit's own product photos
// in the app entirely -- a copyright/reuse-rights concern, not a
// technical one (see the session's own discussion: Blinkit's photos are
// their creative work, not a fact anyone else is free to reuse the way
// ingredient text is). generate-reports.js/blinkit.js no longer create
// new ones going forward (see their own comments) -- this is the
// one-off cleanup for every report ALREADY saved with one.
//
// Only clears report.imageUrl -- deliberately does NOT touch the
// blinkit-images Storage bucket or blinkit_products.optimized_image_url/
// image_url. Those already-downloaded files are left exactly where they
// are (a separate decision from removing the app's own use of them);
// this script is scoped to what the app actually shows.
//
// Usage:
//   node scripts/remove-blinkit-report-images.js            (dry run)
//   node scripts/remove-blinkit-report-images.js --write
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE_SIZE = 300;

// Same transient-timeout retry as the rest of this session's scripts --
// this table sees heavy concurrent write traffic from the background
// scrape loop.
async function withRetry(fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    const result = await fn();
    if (!result.error) return result;
    if (i === attempts || !/timeout/i.test(result.error.message)) return result;
    await sleep(2000 * i);
  }
}

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  let checked = 0, cleared = 0, alreadyClear = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() =>
      supabase
        .from('product_reports')
        .select('id, product_name, report')
        .eq('source', 'blinkit')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );
    if (error) { console.error(error.message); process.exitCode = 1; return; }
    if (!data?.length) break;

    for (const row of data) {
      checked++;
      if (!row.report?.imageUrl) { alreadyClear++; continue; }

      cleared++;
      if (write) {
        const { error: updateError } = await withRetry(() =>
          supabase.from('product_reports').update({ report: { ...row.report, imageUrl: null } }).eq('id', row.id),
        );
        if (updateError) console.warn(`    could not clear ${row.product_name}: ${updateError.message}`);
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`Checked ${checked} Blinkit reports. ${alreadyClear} already had no image. ${cleared} ${write ? 'cleared' : 'would be cleared'}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
