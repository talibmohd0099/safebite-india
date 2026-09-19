// src/services/newsCluster.js
// Groups news_items rows that share an event_key (assigned by Gemini in
// summarizeNewsItems -- see geminiService.js) into one story with
// multiple sources, instead of one card per publisher. Confirmed live as
// the biggest readability problem with the raw per-article feed: 7+
// outlets all covering the same FSSAI-vs-Nestle story showed as 7
// separate, near-identical cards.
//
// Pure function, no AI/network here -- the clustering decision itself
// already happened when event_key was written; this just groups by it.

/**
 * @param {{event_key: ?string}[]} items - already ordered newest-first
 * @returns {({ isCluster: true, key: string, items: object[] } | { isCluster: false, item: object })[]}
 *   Preserves the input's ordering: a cluster takes the position of its
 *   first (most recent) member.
 */
export function clusterNewsItems(items) {
  const clusterIndexByKey = new Map();
  const output = [];

  for (const item of items) {
    if (!item.event_key) {
      output.push({ isCluster: false, item });
      continue;
    }
    if (clusterIndexByKey.has(item.event_key)) {
      output[clusterIndexByKey.get(item.event_key)].items.push(item);
      continue;
    }
    clusterIndexByKey.set(item.event_key, output.length);
    output.push({ isCluster: true, key: item.event_key, items: [item] });
  }

  // A leftover/stray event_key that only ever matched one item isn't a
  // real cluster -- showing a "1 source" badge would be misleading, so
  // it renders as an ordinary single card instead.
  return output.map((entry) => (entry.isCluster && entry.items.length === 1 ? { isCluster: false, item: entry.items[0] } : entry));
}
