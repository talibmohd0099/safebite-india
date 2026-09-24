// src/components/SugarAddsUp.jsx
//
// "If you have this regularly, how much sugar does it add up to?" --
// the product's own label figure, multiplied out. Never a claim about
// what happens to anyone's body (see sugarProjection.js for why).
//
// Built around two research findings: sugar shown as concrete
// teaspoons reads as factual and works, where "high in sugar" doesn't;
// and a warning with no clear action tends to be tuned out rather than
// acted on -- so the frequency toggle IS the action ("once a week
// instead of daily") and the card says exactly how much that saves.
import { useEffect, useState } from 'react';
import { accumulateSugar } from '../services/sugarProjection';

const FREQUENCIES = [
  { perWeek: 7, key: 'sugarFreqDaily' },
  { perWeek: 3, key: 'sugarFreq3' },
  { perWeek: 1, key: 'sugarFreq1' },
];

const SERVING_TEXT_KEY = {
  label: 'sugarPerServing',
  pack: 'sugarPerPack',
  standard: 'sugarPerTypicalServing',
};

const MAX_SPOONS = 12;
const MAX_PACKETS = 15;
const PINK = '#ec4899';

// Counts up from 0 whenever the target changes, so switching frequency
// visibly "piles up" again. Instant under prefers-reduced-motion.
function useCountUp(target, ms = 800) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setValue(target); return undefined; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function PeriodTile({ label, unitLabel, teaspoons, grams, kg }) {
  const shown = useCountUp(teaspoons);
  return (
    <div className="flex-1 rounded-xl px-2 py-2.5 text-center" style={{ background: 'var(--fill)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--label-3)' }}>{label}</p>
      <p className="text-[22px] font-extrabold leading-tight tabular-nums mt-0.5" style={{ color: PINK }}>{shown}</p>
      <p className="text-[10.5px] font-semibold" style={{ color: 'var(--label-3)' }}>{unitLabel}</p>
      <p className="text-[11.5px] tabular-nums mt-0.5" style={{ color: 'var(--label-2)' }}>
        {kg >= 1 ? `${kg} kg` : `${grams} g`}
      </p>
    </div>
  );
}

export default function SugarAddsUp({ projection, t, onShowAlternatives }) {
  const [perWeek, setPerWeek] = useState(7);
  const totals = accumulateSugar(projection.gramsPerServing, perWeek);
  const yearly = totals.year;

  const spoonCount = Math.max(1, Math.round(projection.teaspoonsPerServing));
  const spoonsShown = Math.min(spoonCount, MAX_SPOONS);
  const packets = Math.round(yearly.kg);
  const packetsShown = Math.min(packets, MAX_PACKETS);
  const kind = t(projection.isAddedSugar ? 'sugarKindAdded' : 'sugarKindPlain');

  // The action, stated as a number: going from daily to once a week.
  const dailyYearKg = accumulateSugar(projection.gramsPerServing, 7).year.kg;
  const weeklyYearKg = accumulateSugar(projection.gramsPerServing, 1).year.kg;
  const savedKg = Math.round((dailyYearKg - weeklyYearKg) * 10) / 10;

  return (
    <div className="px-4 py-3.5">
      {/* Frequency toggle -- the realistic "how often" is the user's call */}
      <div className="flex gap-1.5 mb-3.5">
        {FREQUENCIES.map((f) => {
          const active = perWeek === f.perWeek;
          return (
            <button
              key={f.perWeek}
              onClick={() => setPerWeek(f.perWeek)}
              className="tap-scale flex-1 px-2 py-1.5 rounded-full text-[12px] font-semibold"
              style={{ background: active ? PINK : 'var(--fill)', color: active ? '#fff' : 'var(--label-2)' }}
            >
              {t(f.key)}
            </button>
          );
        })}
      </div>

      {/* One serving, as spoons */}
      {/* Where the serving came from is always stated -- an estimate is
          never presented as if the label said it (see servingResolver.js) */}
      <p className="text-[13px] flex items-center flex-wrap gap-1.5" style={{ color: 'var(--label-2)' }}>
        <span>
          {t(SERVING_TEXT_KEY[projection.servingSource] || 'sugarPerServing', { grams: projection.servingGrams, unit: projection.servingUnit })}
        </span>
        {projection.servingSource === 'standard' && (
          <span
            className="text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ background: 'var(--v-moderate-bg)', color: 'var(--v-moderate)' }}
          >
            {t('sugarEstimateTag')}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-0.5 mt-1 mb-1" aria-hidden="true">
        {Array.from({ length: spoonsShown }).map((_, i) => (
          <span key={i} className="item-in text-[22px] leading-none" style={{ animationDelay: `${i * 70}ms` }}>🥄</span>
        ))}
        {spoonCount > MAX_SPOONS && (
          <span className="text-[13px] font-bold ml-1" style={{ color: PINK }}>+{spoonCount - MAX_SPOONS}</span>
        )}
      </div>
      <p className="text-[15px] font-bold" style={{ color: 'var(--label-1)' }}>
        {t('sugarTeaspoons', { tsp: projection.teaspoonsPerServing, kind, grams: projection.gramsPerServing })}
      </p>

      {/* What it adds up to */}
      <div className="flex gap-2 mt-3.5">
        <PeriodTile unitLabel={t('sugarTspShort')} label={t('sugarWeek')} {...totals.week} />
        <PeriodTile unitLabel={t('sugarTspShort')} label={t('sugarMonth')} {...totals.month} />
        <PeriodTile unitLabel={t('sugarTspShort')} label={t('sugarYear')} {...totals.year} />
      </div>

      {/* A year, as 1 kg sugar packets -- a quantity every kitchen knows */}
      {packets >= 1 && (
        <div className="mt-3.5">
          <div className="flex flex-wrap gap-1.5" aria-hidden="true" key={perWeek}>
            {Array.from({ length: packetsShown }).map((_, i) => (
              <span
                key={i}
                className="item-in inline-flex items-center justify-center rounded-[6px] text-[9.5px] font-bold"
                style={{
                  width: 30, height: 38,
                  background: 'rgba(236, 72, 153, 0.12)',
                  border: '1px solid rgba(236, 72, 153, 0.4)',
                  color: PINK,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                1kg
              </span>
            ))}
            {packets > MAX_PACKETS && (
              <span className="self-center text-[13px] font-bold" style={{ color: PINK }}>+{packets - MAX_PACKETS}</span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--label-2)' }}>
            {t('sugarYearPackets', { kg: yearly.kg, packets })}
          </p>
        </div>
      )}

      {/* The action -- a warning with nothing to do about it gets tuned out */}
      {perWeek === 7 && savedKg > 0 && (
        <div className="mt-3 rounded-xl px-3 py-2.5 flex items-start gap-2" style={{ background: 'var(--v-good-bg)' }}>
          <span className="text-[14px] flex-shrink-0" aria-hidden="true">💡</span>
          <p className="text-[13px] leading-snug" style={{ color: 'var(--label-1)' }}>
            {t('sugarSwapFrequency', { kg: savedKg })}
          </p>
        </div>
      )}
      {onShowAlternatives && (
        <button onClick={onShowAlternatives} className="tap-scale text-[13px] font-semibold mt-2.5" style={{ color: 'var(--tint)' }}>
          {t('sugarCompareOptions')} ↓
        </button>
      )}

      <p className="text-[11.5px] leading-relaxed mt-3" style={{ color: 'var(--label-3)' }}>
        {projection.servingSource === 'standard' && `${t('sugarEstimateNote', { grams: projection.servingGrams, unit: projection.servingUnit })} `}
        {t('sugarWhoNote')} {t('sugarDisclaimer')}
      </p>
    </div>
  );
}
