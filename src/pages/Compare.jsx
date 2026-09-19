// src/pages/Compare.jsx
//
// "Which of these fits me better" -- not just "is this one okay".
// Takes 2-3 already-scanned products (picked on the History page) and
// lays their scores/nutrients/additives side by side, plus one
// deterministic sentence naming the real, meaningful differences (see
// compareProducts.js -- never an AI call, never a "buy X").
import { useLocation, useNavigate } from 'react-router-dom';
import { getHistoryById, getScoreColor } from '../utils/storage';
import { useLanguage } from '../contexts/LanguageContext';
import { useFamily } from '../contexts/FamilyContext';
import { buildComparisonRows, describeDifferences } from '../services/compareProducts';
import ProductImage from '../components/ProductImage';

function ScoreBadge({ score }) {
  if (typeof score !== 'number') {
    return <span className="text-[13px]" style={{ color: 'var(--label-3)' }}>—</span>;
  }
  const colors = getScoreColor(score);
  return (
    <span
      className="inline-block text-[13px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: colors.bg, color: colors.color }}
    >
      {score}
    </span>
  );
}

export default function Compare() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { profiles, activeProfileId } = useFamily();
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  const ids = location.state?.ids || [];
  // History entries carry their own `id`, name, image, score, nutrients
  // and ingredients already -- exactly buildReport()'s shape, so this
  // needs no extra fetch of any kind.
  const products = ids.map((id) => getHistoryById(id)).filter(Boolean);

  if (products.length < 2) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 py-16 pb-24 text-center">
        <div className="text-6xl mb-4">⚖️</div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">{t('compareEmptyTitle')}</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">{t('compareEmptyBody')}</p>
        <button
          onClick={() => navigate('/history')}
          className="tap-scale bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {t('compareBackToHistory')}
        </button>
      </div>
    );
  }

  const rows = buildComparisonRows(products, activeProfile);
  const differSentence = describeDifferences(rows);
  const colTemplate = `92px repeat(${rows.length}, 1fr)`;

  const METRIC_ROWS = [
    { key: 'sugarG', label: t('compareMetricSugar'), unit: 'g' },
    { key: 'sodiumMg', label: t('compareMetricSodium'), unit: 'mg' },
    { key: 'proteinG', label: t('compareMetricProtein'), unit: 'g' },
    { key: 'additives', label: t('compareMetricAdditives'), unit: '' },
  ];

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate('/history')}
        className="tap-scale inline-flex items-center gap-1.5 text-[15px] mb-3"
        style={{ color: 'var(--tint)' }}
      >
        ← {t('navHistory')}
      </button>

      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--label-1)' }}>{t('compareTitle')}</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--label-3)' }}>{t('compareSubtitle')}</p>

      <div className="rounded-[16px] overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        {/* Product header -- image + name, tap to open that product's full result. */}
        <div className="grid gap-2 p-3" style={{ gridTemplateColumns: colTemplate }}>
          <div />
          {products.map((p, i) => (
            <button key={p.id} onClick={() => navigate(`/result/${p.id}`)} className="tap-scale text-center">
              <ProductImage src={rows[i].imageUrl} size={56} expandable={false} />
              <p className="text-[10.5px] font-semibold mt-1 leading-tight line-clamp-2" style={{ color: 'var(--label-1)' }}>
                {rows[i].productName}
              </p>
            </button>
          ))}
        </div>

        <div className="h-px" style={{ background: 'var(--separator)' }} />

        {/* Score row (+ personal score row when a profile is active). */}
        <div className="grid gap-2 px-3 py-2.5 items-center" style={{ gridTemplateColumns: colTemplate }}>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>{t('compareMetricScore')}</span>
          {rows.map((r) => (
            <span key={r.lookupKey || r.productName} className="text-center"><ScoreBadge score={r.overallScore} /></span>
          ))}
        </div>

        {activeProfile && (
          <div className="grid gap-2 px-3 py-2.5 items-center" style={{ gridTemplateColumns: colTemplate, background: 'var(--fill)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>
              {t('compareMetricFor', { name: activeProfile.nickname })}
            </span>
            {rows.map((r) => (
              <span key={r.lookupKey || r.productName} className="text-center"><ScoreBadge score={r.personalScore} /></span>
            ))}
          </div>
        )}

        {METRIC_ROWS.map((metric, i) => (
          <div
            key={metric.key}
            className="grid gap-2 px-3 py-2.5 items-center"
            style={{ gridTemplateColumns: colTemplate, borderTop: '1px solid var(--separator)' }}
          >
            <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>{metric.label}</span>
            {rows.map((r) => {
              const value = r[metric.key];
              return (
                <span key={r.lookupKey || r.productName + i} className="text-center text-[13px]" style={{ color: 'var(--label-1)' }}>
                  {typeof value === 'number' ? `${value}${metric.unit}` : <span style={{ color: 'var(--label-3)' }}>—</span>}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Deterministic, always-English computed text -- same convention
          as report.summary (scoringEngine.js): describes the real
          numbers, never phrased as a recommendation. */}
      <div className="mt-4 rounded-[14px] p-4" style={{ background: 'var(--tint-bg)' }}>
        <p className="text-[12px] font-bold mb-1" style={{ color: 'var(--tint)' }}>{t('compareWhatDiffers')}</p>
        <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
          {differSentence || t('compareNoRealDifference')}
        </p>
      </div>

      <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--label-3)' }}>{t('compareMissingDataNote')}</p>
    </div>
  );
}
