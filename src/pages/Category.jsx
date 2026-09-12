// src/pages/Category.jsx
// A real, URL-backed screen for one category's product list -- used to
// be inline state on Home (tapping a tile swapped what Home rendered in
// place). Now it's its own route, so the Android/browser back button
// and deep links both work correctly.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { browseCategoryProducts, getCachedReport } from '../services/productCache';
import { saveToHistory, getScoreColor } from '../utils/storage';
import { CATEGORIES } from '../data/categories';
import ProductImage from '../components/ProductImage';

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
        className="tap-scale inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        ← Back
      </button>

      {/* Full-width banner instead of a small icon + title row -- the
          row was mostly empty space next to a 56px thumbnail. */}
      <div className="relative rounded-2xl overflow-hidden mb-5" style={{ aspectRatio: '3 / 1' }}>
        <img src={category.image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <h1 className="absolute bottom-3 left-4 text-xl font-bold text-white">{category.label}</h1>
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
        <div className="grid grid-cols-3 gap-2.5">
          {results.map((item, i) => {
            const scoreColors = typeof item.score === 'number' ? getScoreColor(item.score) : null;
            return (
              <button
                key={item.lookupKey}
                onClick={() => openResult(item)}
                style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                className="item-in tap-scale bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex flex-col items-center gap-1.5 text-center hover:shadow-md transition-all"
              >
                <ProductImage src={item.imageUrl} size={90} />
                <span className="text-[11px] font-semibold text-slate-700 leading-tight line-clamp-2 w-full">
                  {item.productName}
                </span>
                {scoreColors && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: scoreColors.bg, color: scoreColors.color }}
                  >
                    {item.score}/100
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
