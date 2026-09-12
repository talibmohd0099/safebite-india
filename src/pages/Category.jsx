// src/pages/Category.jsx
// A real, URL-backed screen for one category's product list -- used to
// be inline state on Home (tapping a tile swapped what Home rendered in
// place). Now it's its own route, so the Android/browser back button
// and deep links both work correctly.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { browseCategoryProducts, getCachedReport } from '../services/productCache';
import { saveToHistory } from '../utils/storage';
import { CATEGORIES } from '../data/categories';
import CategoryIcon from '../components/CategoryIcon';

export default function Category() {
  const { id } = useParams();
  const navigate = useNavigate();
  const category = CATEGORIES.find((c) => c.id === id);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    browseCategoryProducts(category.keywords, { limit: 50 }).then((r) => {
      setResults(r);
      setLoading(false);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openResult = async (item) => {
    setError('');
    const cached = await getCachedReport(item.lookupKey);
    if (!cached) {
      setError("Couldn't load that saved report. Please try another one.");
      return;
    }
    cached.lookupKey = item.lookupKey;
    const historyId = saveToHistory(cached, 'search');
    navigate(`/result/${historyId}`);
  };

  if (!category) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Unknown category.</p>
        <button onClick={() => navigate('/browse')} className="tap-scale mt-4 text-green-600 font-semibold">
          ← Back to categories
        </button>
      </div>
    );
  }

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate(-1)}
        className="tap-scale flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        ← Back
      </button>

      <div className="flex items-center gap-3 mb-5">
        <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${category.iconBg} ${category.iconColor}`}>
          <CategoryIcon id={category.id} className="w-6 h-6" />
        </span>
        <h1 className="text-xl font-bold text-slate-800">{category.label}</h1>
      </div>

      {loading && <p className="text-sm text-slate-400 px-1">Loading…</p>}

      {!loading && results.length === 0 && (
        <p className="text-sm text-slate-400 px-1">
          Nothing scored in this category yet — check back as more products get added.
        </p>
      )}

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {!loading && results.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
          {results.map((item, i) => (
            <button
              key={item.lookupKey}
              onClick={() => openResult(item)}
              style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
              className="item-in tap-scale w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
            >
              <span className="min-w-0">
                {item.brand && (
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.brand}</span>
                )}
                <span className="block text-sm text-slate-700 truncate">{item.productName}</span>
              </span>
              {typeof item.score === 'number' && (
                <span className="flex-shrink-0 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                  {item.score}/100
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
