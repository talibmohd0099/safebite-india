// scripts/remove-bundle-listings.js
//
// Removes gift packs / hampers / potlis / assorted packs / combos that are
// already in product_reports (see bundleListing.js for why they can't be
// scored honestly). Dry run by default: prints every product it would
// remove. Blinkit's raw rows stay in blinkit_products, so nothing is
// unrecoverable.
//
// Usage:
//   node scripts/remove-bundle-listings.js            (dry run)
//   node scripts/remove-bundle-listings.js --write    (delete)

import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';
import { isBundleListing } from '../src/services/bundleListing.js';

async function main() {
  if (!isSupabaseConfigured) { console.error('Missing Supabase env.'); process.exitCode = 1; return; }
  const write = process.argv.includes('--write');
  const hits = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('product_reports').select('id, product_name, source').order('id').range(from, from + 999);
    if (error) { console.error(error.message); process.exitCode = 1; return; }
    if (!data?.length) break;
    hits.push(...data.filter((r) => isBundleListing(r.product_name)));
    if (data.length < 1000) break;
  }
  console.log(`${write ? 'REMOVING' : 'Would remove'} ${hits.length} bundle listing(s):\n`);
  for (const h of hits) console.log(`  [${h.source}] ${h.product_name}`);
  if (!write) return;

  let removed = 0;
  for (let i = 0; i < hits.length; i += 100) {
    const ids = hits.slice(i, i + 100).map((h) => h.id);
    const { error } = await supabase.from('product_reports').delete().in('id', ids);
    if (error) console.warn('  delete failed:', error.message); else removed += ids.length;
  }
  console.log(`\nRemoved ${removed}.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
