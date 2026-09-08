// src/pages/History.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory, clearHistory, deleteFromHistory, getScoreColor } from '../utils/storage';
import ScoreCircle from '../components/ScoreCircle';

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(getHistory());

  const handleDelete = (e, id) => {
    e.stopPropagation();
    deleteFromHistory(id);
    setHistory(getHistory());
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all scan history? This cannot be undone.')) {
      clearHistory();
      setHistory([]);
    }
  };

  if (history.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">📋</div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">No scans yet</h2>
        <p className="text-slate-400 text-sm mb-6">
          Your scan history will appear here after you analyze your first product.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          🔍 Scan your first product
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Scan History</h1>
          <p className="text-sm text-slate-400">{history.length} product{history.length !== 1 ? 's' : ''} scanned</p>
        </div>
        <button
          onClick={handleClearAll}
          className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-3">
        {history.map((entry) => {
          const colors = getScoreColor(entry.overallScore || 0);
          const date = new Date(entry.savedAt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
          });

          return (
            <div
              key={entry.id}
              onClick={() => navigate(`/result/${entry.id}`)}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 cursor-pointer hover:border-green-300 hover:shadow-sm transition-all"
            >
              {/* Mini score */}
              <ScoreCircle score={entry.overallScore || 0} size="small" />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
                  {entry.productName || 'Unknown Product'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{date}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {entry.flags?.slice(0, 2).map((flag, i) => (
                    <span key={i} className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-md">
                      {flag}
                    </span>
                  ))}
                  {entry.inputType === 'image' && (
                    <span className="text-xs bg-blue-50 text-blue-500 border border-blue-200 px-1.5 py-0.5 rounded-md">
                      📷 Photo scan
                    </span>
                  )}
                </div>
              </div>

              {/* Delete + arrow */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={(e) => handleDelete(e, entry.id)}
                  className="text-slate-300 hover:text-red-400 text-sm transition-colors"
                  title="Delete"
                >
                  🗑️
                </button>
                <span className="text-slate-300 text-xs">→</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
