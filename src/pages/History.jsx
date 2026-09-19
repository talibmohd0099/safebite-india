// src/pages/History.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory, clearHistory, getScoreColor } from '../utils/storage';
import ScoreCircle from '../components/ScoreCircle';
import ProductImage from '../components/ProductImage';

const FILTERS = ['All', 'Good', 'Moderate', 'Caution'];

// Collapses the app's real 5-tier verdict scale into the 3 buckets the
// filter row offers -- Excellent/Good read the same at a glance here,
// and Poor/Very Poor both mean "be cautious", without changing the
// precise label shown on each row's own score circle.
function bucketFor(score) {
  const label = getScoreColor(score).label;
  if (label === 'Excellent' || label === 'Good') return 'Good';
  if (label === 'Moderate') return 'Moderate';
  return 'Caution';
}

function formatHistoryDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(date, now)) return `Today, ${time}`;
  if (sameDay(date, yesterday)) return `Yesterday, ${time}`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A comparison table only means something with 2-3 products on screen
// at once -- fewer isn't a comparison, and more stops being a quick
// glance (this is also the same cap Result.jsx's alternatives strip
// uses for the same "stays a quick glance" reason).
const MAX_COMPARE = 3;

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(getHistory());
  const [filter, setFilter] = useState('All');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const handleClearAll = () => {
    if (window.confirm('Clear all scan history? This cannot be undone.')) {
      clearHistory();
      setHistory([]);
    }
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedIds([]);
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev
    );
  };

  const goToCompare = () => {
    navigate('/compare', { state: { ids: selectedIds } });
    exitCompareMode();
  };

  if (history.length === 0) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 py-16 pb-24 text-center">
        <div className="text-6xl mb-4">📋</div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">No scans yet</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">
          Your scan history will appear here after you analyze your first product.
        </p>
        <button
          onClick={() => navigate('/')}
          className="tap-scale bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          🔍 Scan your first product
        </button>
      </div>
    );
  }

  const filtered = filter === 'All' ? history : history.filter((e) => bucketFor(e.overallScore || 0) === filter);

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Your food history</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {compareMode ? `Select 2-${MAX_COMPARE} products to compare.` : "See what you've checked so far."}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1.5 flex-shrink-0">
          {history.length >= 2 && (
            <button
              onClick={() => (compareMode ? exitCompareMode() : setCompareMode(true))}
              className="tap-scale text-xs text-green-600 dark:text-green-400 hover:text-green-700 font-semibold transition-colors"
            >
              {compareMode ? 'Cancel' : '⚖️ Compare'}
            </button>
          )}
          {!compareMode && (
            <button
              onClick={handleClearAll}
              className="tap-scale text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-5 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`tap-scale flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filter === f ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">Nothing in this category yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, i) => {
            const selected = selectedIds.includes(entry.id);
            const disabledInCompare = compareMode && !selected && selectedIds.length >= MAX_COMPARE;
            return (
              <div
                key={entry.id}
                onClick={() => (compareMode ? !disabledInCompare && toggleSelected(entry.id) : navigate(`/result/${entry.id}`))}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, opacity: disabledInCompare ? 0.45 : 1 }}
                className={`item-in tap-scale bg-white dark:bg-slate-800 rounded-2xl border shadow-sm p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all ${
                  selected ? 'border-green-500 ring-2 ring-green-500/30' : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                {compareMode && (
                  <div
                    className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold border-2 ${
                      selected ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                )}

                <ProductImage src={entry.imageUrl} size={128} />

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-[15px] leading-snug truncate">
                    {entry.productName || 'Unknown Product'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{formatHistoryDate(entry.savedAt)}</p>
                </div>

                <ScoreCircle score={entry.overallScore || 0} size="small" showLabel />
              </div>
            );
          })}
        </div>
      )}

      {compareMode && (
        <div className="fixed bottom-[76px] left-0 right-0 px-4 z-40">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={goToCompare}
              disabled={selectedIds.length < 2}
              className="tap-scale w-full py-3.5 rounded-2xl text-[15px] font-semibold text-white shadow-lg transition-opacity"
              style={{ background: '#16a34a', opacity: selectedIds.length < 2 ? 0.5 : 1 }}
            >
              {selectedIds.length < 2 ? 'Select at least 2 to compare' : `Compare (${selectedIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
