// src/pages/MyIntake.jsx
//
// Today's logged packaged foods -- see intakeLog.js for the three hard
// rules this follows: never estimate, never show a %-of-target for
// calories/protein/carbs/fat (WHO has no single number for those), and
// this is a LOG of what was told to the app, not a diagnosis of what
// happened in the body. One shared device log, not per Family profile
// (see the product discussion this was scoped from).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodaysEntries, getTodaysTotals, removeLogEntry } from '../services/intakeLog';
import { NUTRIENT_LIMITS } from '../services/dailyHabitCheck';
import { getCachedReport } from '../services/productCache';
import { saveToHistory } from '../utils/storage';
import ProductImage from '../components/ProductImage';

// Raw totals only -- no percentage. WHO doesn't publish one universal
// daily number for these (they scale by a person's age/sex/activity),
// unlike sodium/added sugar/saturated fat/trans fat below, which DO have
// a single adult cap. Showing a % here would mean silently assuming a
// generic target (e.g. "2000 kcal") -- exactly the kind of made-up
// personal number this feature deliberately never asks for or guesses.
const RAW_TOTAL_ROWS = [
  { key: 'caloriesKcal', label: 'Calories', unit: ' kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbohydrateG', label: 'Carbs', unit: 'g' },
  { key: 'totalFatG', label: 'Fat', unit: 'g' },
  { key: 'totalSugarG', label: 'Sugar', unit: 'g' },
];

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function MyIntake() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState(() => getTodaysEntries());
  const [totals, setTotals] = useState(() => getTodaysTotals().totals);

  const refresh = () => {
    setEntries(getTodaysEntries());
    setTotals(getTodaysTotals().totals);
  };

  const handleRemove = (id) => {
    removeLogEntry(id);
    refresh();
  };

  const openProduct = async (entry) => {
    if (!entry.lookupKey) return;
    const cached = await getCachedReport(entry.lookupKey);
    if (!cached) return;
    cached.lookupKey = entry.lookupKey;
    const historyId = saveToHistory(cached, 'search');
    navigate(`/result/${historyId}`);
  };

  const limitRows = NUTRIENT_LIMITS
    .map((l) => ({ ...l, amount: totals[l.key] }))
    .filter((l) => typeof l.amount === 'number');

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">My Intake</h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
        Based on packaged foods you've logged today.
      </p>

      {entries.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-5xl mb-3">🍽️</div>
          <p className="text-slate-600 dark:text-slate-300 font-semibold mb-1">Nothing logged yet today</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mb-6 max-w-xs mx-auto">
            Open a product's report and tap "＋ Log what I had" to start.
          </p>
          <button
            onClick={() => navigate('/')}
            className="tap-scale bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            🔍 Find a product
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Today's logged total</p>
            <div className="grid grid-cols-3 gap-3 mb-1">
              {RAW_TOTAL_ROWS.filter((row) => typeof totals[row.key] === 'number').map((row) => (
                <div key={row.key}>
                  <p className="text-[18px] font-bold text-slate-800 dark:text-slate-100">
                    {Math.round(totals[row.key] * 10) / 10}{row.unit}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{row.label}</p>
                </div>
              ))}
            </div>

            {limitRows.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-2.5">
                {limitRows.map((row) => {
                  const pct = Math.min(100, Math.round((row.amount / row.limit) * 100));
                  return (
                    <div key={row.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600 dark:text-slate-300 capitalize font-medium">{row.label}</span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {Math.round(row.amount * 10) / 10}{row.unit} · {pct}% of WHO daily limit
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-1">
            This is a log of what you told FoodGuard you had — not a measurement of what your body actually absorbed, and not a target or goal.
          </p>

          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 px-0.5">Logged today</p>
          <div className="space-y-2.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 flex items-center gap-3"
              >
                <button onClick={() => openProduct(entry)} className="tap-scale flex-shrink-0" disabled={!entry.lookupKey}>
                  <ProductImage src={entry.imageUrl} size={48} expandable={false} />
                </button>
                <div className="flex-1 min-w-0" onClick={() => openProduct(entry)}>
                  <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 truncate">{entry.productName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {entry.amount}{entry.unit}
                    {typeof entry.nutrients.caloriesKcal === 'number' && ` · ${Math.round(entry.nutrients.caloriesKcal)} kcal`}
                    {' · '}{formatTime(entry.loggedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(entry.id)}
                  aria-label="Remove"
                  className="tap-scale flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
