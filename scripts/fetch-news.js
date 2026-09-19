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

// A bare "food safety india" as a free-text query matched on ANY field
// (including abstracts), which pulled in a lot of unrelated analytical-
// chemistry/sensor-development papers that just happen to mention "food
// safety" while describing a new detection method for something else
// entirely -- verified live: results included things like a fluorescent
// probe for bilirubin detection and wearable sweat sensors, alongside
// genuinely relevant items.
//
// Fixed with three changes, each verified live against the real API
// before landing here:
//  - [Title] restricts the core topic terms to the paper's own title,
//    not any mention anywhere in the abstract -- far higher precision.
//  - india[Title/Abstract] required, matching what this section is
//    actually for -- India-relevant food safety and nutrition, not
//    global food science generally.
//  - NOT (...) excludes titles built around an analytical/detection
//    method -- sensor, spectroscopy, chromatography, nanomaterials --
//    which is where nearly all the irrelevant results were coming from.
// One combined query rather than several narrower ones, since PubMed's
// own OR/NOT operators already express this precisely in one call.
const PUBMED_QUERY =
  '(food safety[Title] OR food adulteration[Title] OR ultra-processed food[Title] OR food additive[Title] OR nutrition policy[Title] OR food labeling[Title]) ' +
  'AND india[Title/Abstract] ' +
  'NOT (sensor[Title] OR biosensor[Title] OR electrochemical[Title] OR spectroscopy[Title] OR chromatography[Title] OR nanoparticle[Title] OR fluorescent[Title] OR aptamer[Title] OR nanocluster[Title] OR nanocomposite[Title])';

async function fetchPubMedResearch() {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(PUBMED_QUERY)}&sort=pub+date&retmax=24&retmode=json`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    console.warn(`  PubMed search failed: ${searchRes.status}`);
    return [];
  }
  const searchData = await searchRes.json();
  const ids = searchData.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) {
    console.warn(`  PubMed summary failed: ${summaryRes.status}`);
    return [];
  }
  const summaryData = await summaryRes.json();

  const items = [];
  for (const id of ids) {
    const doc = summaryData.result?.[id];
    if (!doc?.title) continue;
    items.push({
      type: 'research',
      title: doc.title.replace(/\.$/, ''),
      link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      source: doc.fulljournalname || doc.source || 'PubMed',
      published_at: doc.sortpubdate ? new Date(doc.sortpubdate).toISOString() : null,
      // esummary doesn't include the abstract (only esearch/esummary
      // metadata) -- explicit null, not just an absent key, so every
      // upserted row has the same column set regardless of type.
      source_excerpt: null,
    });
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
        // NewsData already includes this snippet in the same response --
        // summarize-news.js uses it as extra context for a better summary
        // than the bare headline alone would give.
        source_excerpt: article.description || null,
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
