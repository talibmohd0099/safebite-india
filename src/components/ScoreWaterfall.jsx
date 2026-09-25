// src/components/ScoreWaterfall.jsx
//
// The score as a waterfall: a full bar at 100, then each thing that cost
// points takes its bite out of it, in order, down to the final score.
// Every bar is placed on the same 0-100 track, so a bite's length IS its
// real size (see scoreWaterfall.js -- only ever built when the steps
// reproduce the stored score exactly). Bars grow in one after another.
import { getScoreColor } from '../utils/storage';

const CAP_KEY = {
  harmfulCap: 'wfHarmfulCap',
  concerningCap: 'wfConcerningCap',
  nutrientCap: 'wfNutrientCap',
  densityCeiling: 'wfDensityCeiling',
};

function Row({ label, sub, from, to, color, strong, delay }) {
  return (
    <div className="item-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[12.5px] leading-snug min-w-0 truncate ${strong ? 'font-bold' : ''}`} style={{ color: 'var(--label-1)' }}>{label}</p>
        {sub && <p className="text-[11.5px] font-semibold tabular-nums flex-shrink-0" style={{ color }}>{sub}</p>}
      </div>
      <div className="relative h-2.5 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--fill)' }}>
        <div
          className="wf-bar absolute top-0 bottom-0 rounded-full"
          style={{ left: `${to}%`, width: `${Math.max(0.8, from - to)}%`, background: color, animationDelay: `${delay + 120}ms` }}
        />
      </div>
    </div>
  );
}

export default function ScoreWaterfall({ waterfall, t, nutrientLabel }) {
  const finalColors = getScoreColor(waterfall.final);
  const labelFor = (step) => {
    if (step.kind === 'ingredient') return step.name;
    if (step.kind === 'others') return t('wfOthers', { count: step.count });
    return t(CAP_KEY[step.kind], { nutrient: nutrientLabel || '' });
  };
  return (
    <div className="space-y-2.5">
      <Row label={t('wfStart')} sub="100" from={100} to={0} color="var(--label-3)" delay={0} />
      {waterfall.steps.map((step, i) => {
        const isCap = step.kind in CAP_KEY;
        return (
          <Row
            key={i}
            label={labelFor(step)}
            sub={isCap ? t('wfCappedTo', { score: step.to }) : null}
            from={step.from}
            to={step.to}
            color={isCap ? 'var(--v-poor)' : 'var(--v-moderate)'}
            delay={(i + 1) * 110}
          />
        );
      })}
      <Row
        label={t('wfFinal')}
        sub={`${waterfall.final}/100`}
        from={waterfall.final}
        to={0}
        color={finalColors.color}
        strong
        delay={(waterfall.steps.length + 1) * 110}
      />
    </div>
  );
}
