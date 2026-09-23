// scripts/optimize-blinkit-images.js
//
// One-off backfill: processes blinkit_products rows scraped BEFORE
// blinkitImageOptimizer.js existed (which now runs automatically for
// every new product inside blinkit.js's scrapeProduct, at scrape time).
// Only touches rows that don't have an optimized_image_url yet, so
// rerunning this is always safe -- it just picks up the next
// unprocessed batch. Only ever writes optimized_image_url -- this is
// OUR OWN Storage copy, never Blinkit's own server; see generate-
// reports.js for where that distinction actually matters (a report's
// imageUrl must never point at Blinkit directly).
//
// Usage:
//   node scripts/optimize-blinkit-images.js [--limit=50]

import { optimizeAndUploadBlinkitImage } from '../src/services/blinkitImageOptimizer.js';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

// A polite gap between products -- this hits Blinkit's own image CDN
// once per product on top of whatever the concurrent scrape loop is
// already doing, and a full backlog run is thousands of requests in a
// row. No hard rate limit is documented for cdn.grofers.com (unlike
// Gemini's vision API), so this is a courtesy pace, not a measured one.
const REQUEST_GAP_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;

  const { data: rows, error } = await supabase
    .from('blinkit_products')
    .select('id, product_name, image_url')
    .not('image_url', 'is', null)
    .is('optimized_image_url', null)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Could not read blinkit_products:', error.message);
    if (/column .*optimized_image_url.* does not exist/i.test(error.message)) {
      console.error('Run supabase/blinkit_images_storage_setup.sql first.');
    }
    process.exitCode = 1;
    return;
  }

  if (!rows || rows.length === 0) {
    console.log('Nothing to process -- every product already has an optimized image, or none have image_url set.');
    return;
  }

  console.log(`Processing ${rows.length} product(s)...\n`);

  let ok = 0;
  let failed = 0;
  const report = [];

  for (const row of rows) {
    const result = await optimizeAndUploadBlinkitImage(row.image_url, row.id);
    if (!result) {
      failed += 1;
      console.log(`  ERR ${row.product_name || row.id}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('blinkit_products')
      .update({ optimized_image_url: result.url, optimized_image_bytes: result.bytes })
      .eq('id', row.id);
    if (updateError) {
      failed += 1;
      console.log(`  ERR ${row.product_name} -- db update failed: ${updateError.message}`);
      continue;
    }

    report.push(result.bytes);
    ok += 1;
    console.log(`  ok  ${row.product_name} -- ${(result.bytes / 1024).toFixed(1)}KB`);
    await sleep(REQUEST_GAP_MS);
  }

  console.log(`\nDone: ${ok} succeeded, ${failed} failed.`);
  if (report.length > 0) {
    const avg = report.reduce((s, b) => s + b, 0) / report.length;
    console.log(`Average: ${(avg / 1024).toFixed(1)}KB. Range: ${(Math.min(...report) / 1024).toFixed(1)}KB - ${(Math.max(...report) / 1024).toFixed(1)}KB`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
