// src/components/WeeklyReportCard.jsx
//
// "Your week" at the top of History: products checked in the last 7
// days, their average score vs the week before, the verdict mix as one
// stacked bar, the flagged ingredient that kept turning up, the best
// pick and the one most worth swapping, a day streak, and a share
// button. See weeklyReport.js -- about what was CHECKED, not eaten.
import { useState } from 'react';
import ScoreCircle from './ScoreCircle';
import { getScoreColor } from '../utils/storage';

// A representative score per tier, just to borrow that tier's colour.
const TIER_COLOR_SCORE = { excellent: 90, good: 75, moderate: 55, poor: 35, veryPoor: 10 };
const TIER_KEY = { excellent: 'weekTierExcellent', good: 'weekTierGood', moderate: 'weekTierModerate', poor: 'weekTierPoor', veryPoor: 'weekTierVeryPoor' };

function PickRow({ icon, label, entry, onOpen }) {
  const c = getScoreColor(entry.overallScore);
  return (
    <button onClick={() => onOpen(entry)} className="tap-scale w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left" style={{ background: 'var(--fill)' }}>
      <span className="text-[15px] flex-shrink-0" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--label-3)' }}>{label}</span>
        <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--label-1)' }}>{entry.productName}</span>
      </span>
      <span className="text-[12px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: c.bg, color: c.color }}>{entry.overallScore}</span>
    </button>
  );
}

export default function WeeklyReportCard({ report, t, onOpen }) {
  const [copied, setCopied] = useState(false);
  const diff = report.previousAverage == null ? null : report.averageScore - report.previousAverage;
  const total = report.count;

  const share = async () => {
    const text = t('weekShareText', { count: total, avg: report.averageScore, best: report.best.productName });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* user cancelled the share sheet */ }
  };

  return (
    <div className="item-in mt-4 rounded-[20px] p-4" style={{ background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[16px] font-bold" style={{ color: 'var(--label-1)' }}>📅 {t('weekTitle')}</p>
        {report.streak >= 2 && (
          <span className="text-[12px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--v-moderate-bg)', color: 'var(--v-moderate)' }}>
            🔥 {t('weekStreak', { days: report.streak })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3.5 mt-3">
        <ScoreCircle score={report.averageScore} size="small" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--label-1)' }}>{t('weekAverage', { count: total })}</p>
          {diff != null && diff !== 0 && (
            <p className="text-[12.5px] font-semibold mt-0.5" style={{ color: diff > 0 ? 'var(--v-good)' : 'var(--v-poor)' }}>
              {diff > 0 ? '▲' : '▼'} {t(diff > 0 ? 'weekBetter' : 'weekWorse', { points: Math.abs(diff) })}
            </p>
          )}
        </div>
      </div>

      {/* Verdict mix, one stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mt-3.5" aria-hidden="true">
        {Object.entries(report.tiers).filter(([, n]) => n > 0).map(([tier, n]) => (
          <span key={tier} className="wf-bar" style={{ width: `${(n / total) * 100}%`, background: getScoreColor(TIER_COLOR_SCORE[tier]).color, transformOrigin: 'left center' }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {Object.entries(report.tiers).filter(([, n]) => n > 0).map(([tier, n]) => (
          <span key={tier} className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--label-2)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: getScoreColor(TIER_COLOR_SCORE[tier]).color }} />
            {t(TIER_KEY[tier])} {n}
          </span>
        ))}
      </div>

      {report.topFlag && (
        <p className="text-[13px] leading-snug mt-3" style={{ color: 'var(--label-2)' }}>
          ⚠️ {t('weekTopFlag', { name: report.topFlag.name, count: report.topFlag.count, total })}
        </p>
      )}

      <div className="space-y-1.5 mt-3">
        <PickRow icon="🏆" label={t('weekBest')} entry={report.best} onOpen={onOpen} />
        {report.worst && <PickRow icon="🔁" label={t('weekWorst')} entry={report.worst} onOpen={onOpen} />}
      </div>

      <button onClick={share} className="tap-scale w-full mt-3 py-2 rounded-xl text-[13px] font-semibold" style={{ background: 'var(--tint-bg)', color: 'var(--tint)' }}>
        {copied ? t('weekCopied') : `↗ ${t('weekShare')}`}
      </button>
    </div>
  );
}
