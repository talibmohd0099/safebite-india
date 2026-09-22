// src/components/LogPortionModal.jsx
//
// "How much did you have?" -- the entry point into My Intake (see
// intakeLog.js) from a product's Result page. Only ever offered when the
// report has real calorie data (see canLogIntake); the trigger that opens
// this never renders otherwise, so there's no "estimate anyway" path here.
//
// Amount is entered as a plain weight/volume number, not a piece count
// ("2 biscuits") -- Blinkit/OFF never publish how many pieces are in a
// pack, only its weight, so a unit-count picker would have nothing real
// to build on. What's offered instead: a quick chip for the product's own
// known serving size when there is one, and a "same as last time" chip
// once this exact product has been logged before (see lastPortionFor).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { addLogEntry, lastPortionFor } from '../services/intakeLog';

const UNITS = ['g', 'ml'];

export default function LogPortionModal({ report, onClose, onLogged }) {
  const remembered = lastPortionFor(report.lookupKey);
  const servingChip = report.realNutrientsServingGrams
    ? { amount: report.realNutrientsServingGrams, unit: report.realNutrientsServingUnit || 'g', label: `1 serving (${report.realNutrientsServingGrams}${report.realNutrientsServingUnit || 'g'})` }
    : null;

  const [amount, setAmount] = useState(String(remembered?.amount ?? servingChip?.amount ?? ''));
  const [unit, setUnit] = useState(remembered?.unit ?? servingChip?.unit ?? 'g');
  const [saved, setSaved] = useState(null); // the logged entry, once submitted

  const numericAmount = Number(amount);
  const valid = Number.isFinite(numericAmount) && numericAmount > 0;

  const submit = () => {
    if (!valid) return;
    const entry = addLogEntry(report, numericAmount, unit);
    if (entry) setSaved(entry);
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-[420px] rounded-t-[24px] sm:rounded-[20px] p-5"
        style={{ background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="tap-scale absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-[18px]"
          style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
        >
          ×
        </button>

        {saved ? (
          <div className="py-2 text-center">
            <p className="text-[34px] leading-none mb-2">✅</p>
            <p className="text-[17px] font-bold mb-1" style={{ color: 'var(--label-1)' }}>Added to My Intake</p>
            <p className="text-[13.5px] mb-4" style={{ color: 'var(--label-2)' }}>
              {saved.amount}{saved.unit} of {saved.productName}
            </p>
            <div className="flex justify-center gap-5 mb-5">
              {typeof saved.nutrients.caloriesKcal === 'number' && (
                <div>
                  <p className="text-[20px] font-bold" style={{ color: 'var(--label-1)' }}>{Math.round(saved.nutrients.caloriesKcal)}</p>
                  <p className="text-[11px]" style={{ color: 'var(--label-3)' }}>kcal</p>
                </div>
              )}
              {typeof saved.nutrients.proteinG === 'number' && (
                <div>
                  <p className="text-[20px] font-bold" style={{ color: 'var(--label-1)' }}>{Math.round(saved.nutrients.proteinG * 10) / 10}g</p>
                  <p className="text-[11px]" style={{ color: 'var(--label-3)' }}>protein</p>
                </div>
              )}
              {typeof saved.nutrients.sodiumMg === 'number' && (
                <div>
                  <p className="text-[20px] font-bold" style={{ color: 'var(--label-1)' }}>{Math.round(saved.nutrients.sodiumMg)}mg</p>
                  <p className="text-[11px]" style={{ color: 'var(--label-3)' }}>sodium</p>
                </div>
              )}
            </div>
            <button
              onClick={() => { onLogged?.(); onClose(); }}
              className="tap-scale w-full py-3 rounded-[14px] text-[16px] font-semibold text-white"
              style={{ background: 'var(--tint)' }}
            >
              See today's intake
            </button>
            <button onClick={onClose} className="tap-scale w-full mt-2 py-2 text-[13.5px]" style={{ color: 'var(--label-3)' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <p className="text-[17px] font-bold pr-8 mb-1" style={{ color: 'var(--label-1)' }}>How much did you have?</p>
            <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: 'var(--label-2)' }}>{report.productName}</p>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="flex-1 min-w-0 px-3.5 py-3 rounded-[12px] text-[16px] font-semibold"
                style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
              />
              <div className="flex rounded-[12px] overflow-hidden flex-shrink-0" style={{ background: 'var(--fill)' }}>
                {UNITS.map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className="tap-scale px-4 py-3 text-[14px] font-semibold"
                    style={{ background: unit === u ? 'var(--tint)' : 'transparent', color: unit === u ? '#fff' : 'var(--label-3)' }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {(servingChip || remembered) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {servingChip && (
                  <button
                    onClick={() => { setAmount(String(servingChip.amount)); setUnit(servingChip.unit); }}
                    className="tap-scale px-3 py-1.5 rounded-full text-[12.5px] font-semibold"
                    style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
                  >
                    {servingChip.label}
                  </button>
                )}
                {remembered && (
                  <button
                    onClick={() => { setAmount(String(remembered.amount)); setUnit(remembered.unit); }}
                    className="tap-scale px-3 py-1.5 rounded-full text-[12.5px] font-semibold"
                    style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
                  >
                    Same as last time ({remembered.amount}{remembered.unit})
                  </button>
                )}
              </div>
            )}

            <p className="text-[11.5px] leading-relaxed mb-4" style={{ color: 'var(--label-3)' }}>
              Based on the nutrition this product actually lists — not an estimate.
            </p>

            <button
              onClick={submit}
              disabled={!valid}
              className="tap-scale w-full py-3 rounded-[14px] text-[16px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--tint)' }}
            >
              Add to My Intake
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
