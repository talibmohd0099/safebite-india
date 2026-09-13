// scripts/fetch-news.js
//
// Populates news_items (see supabase/news_items_schema.sql) with two
// independent feeds:
//
// - Real nutrition/food-safety research from PubMed's public E-utilities
//   API -- free, no key, no usage restriction on this kind of use.
//   Always runs.
// - India food-safety news headlines from a news API -- only runs once
//   NEWSDATA_API_KEY is set. Deliberately NOT Google News' RSS feed:
//   its own copyright notice restricts it to "personal, non-commercial"
//   use in a feed reader, which a public app doesn't qualify as.
//
// The app itself never calls either source directly -- it only reads
// this table, so a slow/rate-limited upstream never affects page load,
// and this script is the only thing that needs to be polite about
// request pacing.
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient.js';

// Deliberately more specific than a bare "food safety india" -- that
// broad a query pulls in unrelated materials-science/sensor papers that
// just happen to use the phrase "food safety" in an abstract. These
// read closer to what a general reader means by "new research" on
// this topic. Worth continuing to tune once real results are visible.
const PUBMED_QUERIES = [
  'food adulteration india health',
  'ultra-processed food health india',
  'food additive health effects',
];

async function fetchPubMedResearch() {
  const items = [];

  for (const query of PUBMED_QUERIES) {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&sort=pub+date&retmax=8&retmode=json`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.warn(`  PubMed search failed for "${query}": ${searchRes.status}`);
      continue;
    }
    const searchData = await searchRes.json();
    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) continue;

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) {
      console.warn(`  PubMed summary failed for "${query}": ${summaryRes.status}`);
      continue;
    }
    const summaryData = await summaryRes.json();

    for (const id of ids) {
      const doc = summaryData.result?.[id];
      if (!doc?.title) continue;
      items.push({
        type: 'research',
        title: doc.title.replace(/\.$/, ''),
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: doc.fulljournalname || doc.source || 'PubMed',
        published_at: doc.sortpubdate ? new Date(doc.sortpubdate).toISOString() : null,
      });
    }

    // NCBI asks for no more than ~3 requests/sec without a registered API key.
    await new Promise((r) => setTimeout(r, 400));
  }

  return items;
}

async function fetchIndiaFoodNews() {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    console.log('  NEWSDATA_API_KEY not set -- skipping India food news headlines (research still runs).');
    return [];
  }

  const queries = ['food safety', 'FSSAI', 'food recall'];
  const items = [];

  for (const query of queries) {
    const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodeURIComponent(query)}&country=in&language=en`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  NewsData request failed for "${query}": ${res.status}`);
      continue;
    }
    const data = await res.json();
    for (const article of data.results || []) {
      if (!article.title || !article.link) continue;
      items.push({
        type: 'news',
        title: article.title,
        link: article.link,
        source: article.source_id || null,
        published_at: article.pubDate ? new Date(article.pubDate).toISOString() : null,
      });
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return items;
}

async function main() {
  if (!isSupabaseConfigured) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exitCode = 1;
    return;
  }

  console.log('Fetching research from PubMed...');
  const research = await fetchPubMedResearch();
  console.log(`  Found ${research.length} research item(s).`);

  console.log('Fetching India food news...');
  const news = await fetchIndiaFoodNews();
  console.log(`  Found ${news.length} news item(s).`);

  const seen = new Set();
  const deduped = [...research, ...news].filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });

  if (deduped.length === 0) {
    console.log('Nothing to save.');
    return;
  }

  const { error } = await supabase.from('news_items').upsert(deduped, { onConflict: 'link' });
  if (error) {
    console.error('Failed to save news items:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Saved/updated ${deduped.length} item(s).`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
