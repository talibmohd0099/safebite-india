// src/pages/PopularSearches.jsx
// "See all" destination for the home screen's popular-searches pill row
// (which only shows the top 8). Tapping a term here goes to Home with
// that search already filled in and running.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPopularSearchTerms } from '../services/productCache';

export default function PopularSearches() {
  const navigate = useNavigate();
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPopularSearchTerms(30).then((t) => {
      setTerms(t);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate(-1)}
        className="tap-scale inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        ← Back
      </button>
      <h1 className="text-xl font-bold text-slate-800 mb-5">Popular searches</h1>

      {loading && <p className="text-sm text-slate-400 px-1">Loading…</p>}

      {!loading && terms.length === 0 && (
        <p className="text-sm text-slate-400 px-1">Nothing scanned enough yet to show here.</p>
      )}

      {!loading && terms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {terms.map((term, i) => (
            <button
              key={term}
              onClick={() => navigate(`/?q=${encodeURIComponent(term)}`)}
              style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
              className="item-in tap-scale px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
