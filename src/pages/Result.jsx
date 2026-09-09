// src/pages/Result.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getHistoryById, updateHistoryProductName } from '../utils/storage';
import { updateProductName } from '../services/productCache';
import ScoreCircle from '../components/ScoreCircle';
import IngredientCard from '../components/IngredientCard';

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'harmful', 'concerning', 'safe'
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    const data = getHistoryById(id);
    if (!data) {
      navigate('/');
      return;
    }
    setResult(data);
  }, [id, navigate]);

  const startEditingName = () => {
    setNameInput(result.productName === 'Unknown Product' ? '' : result.productName || '');
    setEditingName(true);
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setEditingName(false);
      return;
    }
    setResult((prev) => ({ ...prev, productName: trimmed }));
    updateHistoryProductName(result.id, trimmed);
    if (result.lookupKey) updateProductName(result.lookupKey, trimmed);
    setEditingName(false);
  };

  if (!result) return null;

  const ingredients = result.ingredients || [];
  const harmful = ingredients.filter(i => i.status === 'harmful');
  const concerning = ingredients.filter(i => i.status === 'concerning');
  const safe = ingredients.filter(i => i.status === 'safe');

  const filteredIngredients = filter === 'all' ? ingredients
    : ingredients.filter(i => i.status === filter);

  const savedDate = new Date(result.savedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const reportId = `SB-${(result.id || '').toString().slice(-8).toUpperCase()}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        ← New scan
      </button>

      {/* Report Card */}
      <div className="bg-white rounded-2xl border border-slate-200 mb-4 shadow-sm overflow-hidden">

        {/* Letterhead */}
        <div className="bg-slate-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <span className="text-white text-xs font-bold tracking-widest uppercase">SafeBite Health Report</span>
          </div>
          <div className="text-right">
            <p className="text-slate-300 text-[11px] leading-tight">{reportId}</p>
            <p className="text-slate-400 text-[11px] leading-tight">{savedDate}</p>
          </div>
        </div>

        <div className="p-6 text-center">
          {result.brand && !editingName && (
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              {result.brand}
            </p>
          )}
          {editingName ? (
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <input
                type="text"
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                placeholder="Enter product name"
                className="flex-1 max-w-xs text-center text-xl font-bold text-slate-800 border-b-2 border-green-500 focus:outline-none bg-transparent"
              />
              <button
                onClick={saveName}
                className="text-green-600 hover:text-green-800 text-lg"
                aria-label="Save name"
              >
                ✓
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <h1 className="text-xl font-bold text-slate-800 mb-1.5 flex items-center justify-center gap-2 group">
              {result.productName || 'Unknown Product'}
              <button
                onClick={startEditingName}
                className="text-slate-300 hover:text-slate-500 text-sm transition-colors"
                aria-label="Edit product name"
                title="Edit product name"
              >
                ✏️
              </button>
            </h1>
          )}
          {result.productName === 'Unknown Product' && !editingName && (
            <p className="text-xs text-amber-600 -mt-1 mb-4">
              We couldn't identify this product — tap ✏️ to name it yourself.
            </p>
          )}
          {result.verdict && (
            <span className="inline-block text-xs font-bold uppercase tracking-wide text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 mb-6">
              Verdict: {result.verdict}
            </span>
          )}

          <div className="flex flex-col items-center mb-6">
            <ScoreCircle score={result.overallScore || 0} size="large" />
            <Link
              to="/about#how-score-works"
              className="text-xs text-slate-400 hover:text-green-600 underline underline-offset-2 mt-2 transition-colors"
            >
              How is this score calculated?
            </Link>
          </div>

          {result.summary && (
            <div className="text-left bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Executive Summary</p>
              <p className="text-sm text-slate-600 leading-relaxed">
                {result.summary}
              </p>
            </div>
          )}

          {result.hasEstimatedQuantities && (
            <div className="text-left bg-blue-50 border border-blue-100 rounded-xl p-3 mt-3">
              <p className="text-xs text-blue-700 leading-relaxed">
                ℹ️ This label doesn't state an exact percentage for every ingredient, so part of this score is a reasonable estimate rather than this product's exact measured composition.
              </p>
            </div>
          )}
        </div>

        {/* Credibility strip */}
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <span className="text-green-600">✓</span> FSSAI cross-checked
          </span>
          <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <span className="text-green-600">✓</span> EU/EFSA compared
          </span>
          <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <span className="text-green-600">✓</span> AI-analyzed
          </span>
        </div>
      </div>

      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">01 · Safety Breakdown</p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <button
          onClick={() => setFilter(filter === 'harmful' ? 'all' : 'harmful')}
          className={`rounded-xl border p-3 text-center transition-all ${
            filter === 'harmful' ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-red-300'
          }`}
        >
          <div className="text-2xl font-bold text-red-600">{harmful.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">🚫 Harmful</div>
        </button>
        <button
          onClick={() => setFilter(filter === 'concerning' ? 'all' : 'concerning')}
          className={`rounded-xl border p-3 text-center transition-all ${
            filter === 'concerning' ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 bg-white hover:border-yellow-300'
          }`}
        >
          <div className="text-2xl font-bold text-yellow-600">{concerning.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">⚠️ Concerning</div>
        </button>
        <button
          onClick={() => setFilter(filter === 'safe' ? 'all' : 'safe')}
          className={`rounded-xl border p-3 text-center transition-all ${
            filter === 'safe' ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white hover:border-green-300'
          }`}
        >
          <div className="text-2xl font-bold text-green-600">{safe.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">✅ Safe</div>
        </button>
      </div>

      {(result.flags?.length > 0 || result.positives?.length > 0 || result.recommendation) && (
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">02 · Key Findings</p>
      )}

      {/* Flags */}
      {result.flags?.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-orange-800 mb-2">⚠️ Watch out for:</p>
          <div className="flex flex-wrap gap-2">
            {result.flags.map((flag, i) => (
              <span key={i} className="bg-orange-100 text-orange-700 border border-orange-200 text-xs font-medium px-2.5 py-1 rounded-full">
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Positives */}
      {result.positives?.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-green-800 mb-2">👍 Good things:</p>
          <div className="flex flex-wrap gap-2">
            {result.positives.map((pos, i) => (
              <span key={i} className="bg-green-100 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-1 rounded-full">
                {pos}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {result.recommendation && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-blue-800 mb-1">💡 Our recommendation</p>
          <p className="text-sm text-blue-700">{result.recommendation}</p>
        </div>
      )}

      {/* Ingredients List */}
      <div className="mb-4">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">03 · Detailed Ingredient Analysis</p>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-800">
            Ingredient Breakdown
          </h2>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="text-xs text-green-600 hover:text-green-800 font-medium"
            >
              Show all
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">
          💡 Tap any ingredient to see what it is, its health effects, and research it further.
        </p>

        {filteredIngredients.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No ingredients in this category.</p>
        ) : (
          <div className="space-y-2">
            {filteredIngredients.map((ingredient, i) => (
              <IngredientCard key={i} ingredient={ingredient} />
            ))}
          </div>
        )}
      </div>

      {/* Raw label text, for the user to cross-check against the pack */}
      {result.ingredientsText && (
        <div className="mb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">04 · As Read From The Label</p>
          <p className="text-xs text-slate-400 mb-2 px-1">
            Compare this against the breakdown above — if something on your actual pack isn't in here, it may have been missed during reading.
          </p>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
              {result.ingredientsText}
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-500 leading-relaxed">
        <strong>Disclaimer:</strong> SafeBite is an AI-powered tool for informational purposes only. 
        Always consult a healthcare professional for dietary advice. Scores are based on general health guidelines and may not account for individual health conditions.
      </div>

      {/* Scan again */}
      <button
        onClick={() => navigate('/')}
        className="w-full mt-4 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors"
      >
        🔍 Scan Another Product
      </button>
    </div>
  );
}
