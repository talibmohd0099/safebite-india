// src/pages/MyIntake.jsx
//
// A packaged-food consumption log -- see intakeLog.js for the three hard
// rules this follows: never estimate, never show a %-of-target for
// calories/protein/carbs/fat/total sugar (no single WHO number for those),
// and this is a LOG of what was told to the app, not a diagnosis of what
// happened in the body. One shared device log, not per Family profile.
//
// The four nutrients dailyHabitCheck.js has a WHO daily limit for aren't
// all the same KIND of limit, and the card below deliberately treats them
// differently:
//   - Sodium's WHO limit (2,000mg) is a flat number for any adult,
//     independent of how much they eat that day -- a %-of-limit bar is a
//     fair, literal statement.
//   - Added sugar/saturated fat/trans fat's WHO guidance is instead a
//     PERCENTAGE OF ENERGY INTAKE ("<10% of total energy", "<1% of total
//     energy") -- the gram figures in NUTRIENT_LIMITS are examples worked
//     out for a 2,000 kcal reference diet, not a number that applies to
//     everyone regardless of how much they eat. Since this app deliberately
//     never collects a personal calorie target, showing a "% of limit" bar
//     for these would quietly borrow that same 2,000 kcal assumption back
//     in without saying so. They get the plain WHO guidance sentence
//     instead, with the raw gram amount alongside it -- true either way.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEntriesForDay, getTotalsForDay, getLoggedDays, removeLogEntry } from '../services/intakeLog';
import { NUTRIENT_LIMITS } from '../services/dailyHabitCheck';
import { getCachedReport } from '../services/productCache';
import { saveToHistory } from '../utils/storage';
import ProductImage from '../components/ProductImage';

const RAW_TOTAL_ROWS = [
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbohydrateG', label: 'Carbs', unit: 'g' },
  { key: 'totalFatG', label: 'Fat', unit: 'g' },
  { key: 'totalSugarG', label: 'Total sugar', unit: 'g' },
];

// Sodium is the one WHO limit that's a flat number for any adult -- see
// the file header. Everything else in NUTRIENT_LIMITS is energy-relative.
const ENERGY_RELATIVE_GUIDANCE = {
  addedSugarG: { icon: '🍬', label: 'Added sugar', text: 'WHO recommends limiting free sugars to less than 10% of total energy intake.' },
  saturatedFatG: { icon: '🧈', label: 'Saturated fat', text: 'WHO recommends limiting saturated fat to less than 10% of total energy intake.' },
  transFatG: { icon: '🧴', label: 'Trans fat', text: 'WHO recommends limiting trans fat to less than 1% of total energy intake.' },
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(date, today) {
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function DaySwitcher({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Today is always offered, even with nothing logged yet, plus any past day that has entries.
  const days = [today, ...getLoggedDays().filter((d) => d.getTime() !== today.getTime())];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="tap-scale flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[13px] font-semibold text-slate-700 dark:text-slate-200"
      >
        📅 {dayLabel(selected, today)} <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-10">
          {days.map((d) => (
            <button
              key={d.toDateString()}
              onClick={() => { onSelect(d); setOpen(false); }}
              className={`tap-scale w-full text-left px-3.5 py-2.5 text-[13px] ${d.toDateString() === selected.toDateString() ? 'font-bold text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-200'}`}
            >
              {dayLabel(d, today)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryMenu({ entry, onView, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Options"
        className="tap-scale w-8 h-8 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-10">
          <button
            onClick={() => { setOpen(false); onView(entry); }}
            disabled={!entry.lookupKey}
            className="tap-scale w-full text-left px-3.5 py-2.5 text-[13px] text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            View product
          </button>
          <button
            onClick={() => { setOpen(false); onRemove(entry); }}
            className="tap-scale w-full text-left px-3.5 py-2.5 text-[13px] text-red-600 dark:text-red-400 border-t border-slate-100 dark:border-slate-700"
          >
            Remove from intake
          </button>
        </div>
      )}
    </div>
  );
}

export default function MyIntake() {
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [entries, setEntries] = useState(() => getEntriesForDay(selectedDay));
  const [totals, setTotals] = useState(() => getTotalsForDay(selectedDay).totals);
  const [showLearnMore, setShowLearnMore] = useState(false);

  useEffect(() => {
    setEntries(getEntriesForDay(selectedDay));
    setTotals(getTotalsForDay(selectedDay).totals);
  }, [selectedDay]);

  const isToday = selectedDay.toDateString() === new Date().toDateString();

  const refresh = () => {
    setEntries(getEntriesForDay(selectedDay));
    setTotals(getTotalsForDay(selectedDay).totals);
  };

  const handleRemove = (entry) => {
    removeLogEntry(entry.id);
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

  const sodiumLimit = NUTRIENT_LIMITS.find((l) => l.key === 'sodiumMg');
  const sodiumAmount = totals.sodiumMg;
  const sodiumPct = typeof sodiumAmount === 'number' ? Math.min(100, Math.round((sodiumAmount / sodiumLimit.limit) * 100)) : null;

  const energyRelativeRows = Object.entries(ENERGY_RELATIVE_GUIDANCE)
    .filter(([key]) => typeof totals[key] === 'number')
    .map(([key, info]) => ({ key, amount: totals[key], ...info }));

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-8 pb-24">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Intake</h1>
        <DaySwitcher selected={selectedDay} onSelect={setSelectedDay} />
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
        Based on packaged foods you've logged {isToday ? 'today' : 'on ' + selectedDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.
      </p>

      {entries.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-5xl mb-3">🍽️</div>
          <p className="text-slate-600 dark:text-slate-300 font-semibold mb-1">
            {isToday ? 'Nothing logged yet today' : 'Nothing logged this day'}
          </p>
          {isToday && (
            <p className="text-slate-400 dark:text-slate-500 text-sm mb-6 max-w-xs mx-auto">
              Open a product's report and tap "＋ Log what I had" to start.
            </p>
          )}
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
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
              {isToday ? "Today's logged total" : 'Logged total'}
            </p>
            {typeof totals.caloriesKcal === 'number' && (
              <p className="mb-3">
                <span className="text-[36px] font-extrabold text-slate-800 dark:text-slate-100 leading-none">{Math.round(totals.caloriesKcal)}</span>
                <span className="text-[15px] font-semibold text-slate-400 dark:text-slate-500 ml-1.5">kcal</span>
              </p>
            )}
            <div className="grid grid-cols-4 gap-2 pb-1">
              {RAW_TOTAL_ROWS.filter((row) => typeof totals[row.key] === 'number').map((row) => (
                <div key={row.key}>
                  <p className="text-[16px] font-bold text-slate-800 dark:text-slate-100">
                    {Math.round(totals[row.key] * 10) / 10}{row.unit}
                  </p>
                  <p className="text-[10.5px] text-slate-400 dark:text-slate-500">{row.label}</p>
                </div>
              ))}
            </div>

            {(sodiumPct !== null || energyRelativeRows.length > 0) && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2.5">
                {sodiumPct !== null && (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">🧂</span>
                      <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">Sodium</span>
                    </div>
                    <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100 mb-0.5">{Math.round(sodiumAmount * 10) / 10}mg</p>
                    <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 mb-1.5">
                      {sodiumPct}% <span className="font-normal text-slate-400 dark:text-slate-500">of WHO adult limit ({sodiumLimit.limit.toLocaleString('en-IN')}mg)</span>
                    </p>
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${sodiumPct >= 100 ? 'bg-red-500' : sodiumPct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${sodiumPct}%` }}
                      />
                    </div>
                  </div>
                )}
                {energyRelativeRows.map((row) => (
                  <div key={row.key} className="rounded-xl p-3" style={{ background: 'rgba(234, 179, 8, 0.08)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{row.icon}</span>
                      <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{row.label}</span>
                    </div>
                    <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100 mb-1.5">{Math.round(row.amount * 10) / 10}g</p>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug">{row.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-3.5 mb-4 flex items-start gap-2.5" style={{ background: 'rgba(34, 197, 94, 0.08)' }}>
            <span className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5">ⓘ</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-green-800 dark:text-green-300 leading-relaxed">
                {showLearnMore
                  ? "This is a log of what you told FoodGuard you had — not a measurement of what your body actually absorbed, and not a target or goal."
                  : 'Logged intake, not actual absorption or a personal target.'}
              </p>
              <button onClick={() => setShowLearnMore((v) => !v)} className="tap-scale text-[11.5px] font-semibold text-green-700 dark:text-green-400 mt-1">
                {showLearnMore ? 'Show less' : 'Learn more ›'}
              </button>
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-2 px-0.5">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{isToday ? 'Logged today' : 'Logged'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{entries.length} food{entries.length === 1 ? '' : 's'}</p>
          </div>
          <div className="space-y-2.5 mb-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 flex items-center gap-3"
              >
                <button onClick={() => openProduct(entry)} className="tap-scale flex-shrink-0" disabled={!entry.lookupKey}>
                  <ProductImage src={entry.imageUrl} size={48} expandable={false} />
                </button>
                <button onClick={() => openProduct(entry)} className="flex-1 min-w-0 text-left" disabled={!entry.lookupKey}>
                  <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 truncate">{entry.productName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {entry.amount}{entry.unit} consumed
                    {typeof entry.nutrients.caloriesKcal === 'number' && ` · ${Math.round(entry.nutrients.caloriesKcal)} kcal`}
                    {' · '}{formatTime(entry.loggedAt)}
                  </p>
                </button>
                <EntryMenu entry={entry} onView={openProduct} onRemove={handleRemove} />
              </div>
            ))}
          </div>

          {isToday && (
            <button
              onClick={() => navigate('/')}
              className="tap-scale w-full py-3.5 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-[15px] transition-colors"
            >
              ＋ Log another food
            </button>
          )}
        </>
      )}
    </div>
  );
}
