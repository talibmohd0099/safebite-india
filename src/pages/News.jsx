// src/pages/News.jsx
// "Stay up to date" -- official regulator links (static, never breaks),
// plus cached India food-news headlines and real nutrition/food-safety
// research (both populated by scripts/fetch-news.js on a schedule, read
// here from news_items rather than ever calling PubMed or a news API
// directly from the browser).
import { useEffect, useState } from 'react';
import { getNewsItems } from '../services/newsRepo';

const OFFICIAL_SOURCES = [
  { label: 'FSSAI', desc: "India's food safety regulator — advisories, recalls, and standards.", url: 'https://fssai.gov.in' },
  { label: 'EFSA', desc: "The EU's food safety authority — research and risk assessments.", url: 'https://www.efsa.europa.eu' },
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function NewsCard({ item }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-scale block bg-white border border-slate-200 rounded-2xl p-4 mb-2.5"
    >
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-1">{item.title}</p>
      <p className="text-xs text-slate-400">
        {[item.source, formatDate(item.published_at)].filter(Boolean).join(' · ')}
      </p>
    </a>
  );
}

function EmptySection({ children }) {
  return (
    <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl p-4">
      {children}
    </p>
  );
}

export default function News() {
  const [research, setResearch] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getNewsItems('research', 20), getNewsItems('news', 20)]).then(([r, n]) => {
      setResearch(r);
      setNews(n);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">News &amp; Research</h1>
        <p className="text-sm text-slate-500">Stay up to date on food safety in India and beyond.</p>
      </div>

      <h2 className="text-sm font-bold text-slate-800 mb-2">Official sources</h2>
      <div className="mb-6 space-y-2.5">
        {OFFICIAL_SOURCES.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-scale flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{s.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
            </div>
            <span className="text-slate-300 text-lg flex-shrink-0">→</span>
          </a>
        ))}
      </div>

      <h2 className="text-sm font-bold text-slate-800 mb-2">India food news</h2>
      <div className="mb-6">
        {loading ? (
          <EmptySection>Loading…</EmptySection>
        ) : news.length === 0 ? (
          <EmptySection>Coming soon — this section fills in once headlines are connected.</EmptySection>
        ) : (
          news.map((item) => <NewsCard key={item.id} item={item} />)
        )}
      </div>

      <h2 className="text-sm font-bold text-slate-800 mb-2">Latest research</h2>
      <div>
        {loading ? (
          <EmptySection>Loading…</EmptySection>
        ) : research.length === 0 ? (
          <EmptySection>Nothing yet — check back soon.</EmptySection>
        ) : (
          research.map((item) => <NewsCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
