// src/pages/History.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory, clearHistory, getScoreColor } from '../utils/storage';
import ScoreCircle from '../components/ScoreCircle';
import ProductImage from '../components/ProductImage';

const FILTERS = ['All', 'Good', 'Moderate', 'Caution'];

// Collapses the app's real 5-tier verdict scale into the 3 buckets the
// filter row offers -- Very Healthy/Good read the same at a glance here,
// and Poor/Very Poor both mean "be cautious", without changing the
// precise label shown on each row's own score circle.
function bucketFor(score) {
  const label = getScoreColor(score).label;
  if (label === 'Very Healthy' || label === 'Good') return 'Good';
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

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(getHistory());
  const [filter, setFilter] = useState('All');

  const handleClearAll = () => {
    if (window.confirm('Clear all scan history? This cannot be undone.')) {
      clearHistory();
      setHistory([]);
    }
  };

  if (history.length === 0) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">📋</div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">No scans yet</h2>
        <p className="text-slate-400 text-sm mb-6">
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
    <div className="page-in max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Your food history</h1>
          <p className="text-sm text-slate-400 mt-0.5">See what you've checked so far.</p>
        </div>
        <button
          onClick={handleClearAll}
          className="tap-scale text-xs text-red-400 hover:text-red-600 font-medium transition-colors mt-1.5"
        >
          Clear all
        </button>
      </div>

      <div className="flex gap-2 mt-5 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`tap-scale flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filter === f ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">Nothing in this category yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, i) => (
            <div
              key={entry.id}
              onClick={() => navigate(`/result/${entry.id}`)}
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              className="item-in tap-scale bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all"
            >
              <ProductImage src={entry.imageUrl} size={64} />

              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-snug truncate">
                  {entry.productName || 'Unknown Product'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formatHistoryDate(entry.savedAt)}</p>
              </div>

              <ScoreCircle score={entry.overallScore || 0} size="small" showLabel />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
