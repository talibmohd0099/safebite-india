// src/pages/Compare.jsx
//
// "Which of these fits me better" -- not just "is this one okay". Reads
// the 2-4 products picked on CompareManage.jsx (passed via router state,
// already full buildReport() output -- no extra fetch needed) and lays
// score/nutrients/additives/processing side by side, plus deterministic
// "what differs" bullets and a closing summary (compareProducts.js --
// never an AI call, never phrased as "buy X").
import { useLocation, useNavigate } from 'react-router-dom';
import { getScoreColor, saveToHistory } from '../utils/storage';
import { useFamily } from '../contexts/FamilyContext';
import { buildComparisonRows, describeDifferences, scoreFitLabels, personalFitLabels } from '../services/compareProducts';
import ProductImage from '../components/ProductImage';

function ScoreCell({ score, relativeLabel }) {
  if (typeof score !== 'number') {
    return <span className="text-[13px]" style={{ color: 'var(--label-3)' }}>—</span>;
  }
  const colors = getScoreColor(score);
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className="text-[13px] font-bold px-2 py-0.5 rounded-full" style={{ background: colors.bg, color: colors.color }}>
        {score}
      </span>
      {relativeLabel && <span className="text-[9.5px] font-semibold" style={{ color: 'var(--label-3)' }}>{relativeLabel}</span>}
    </span>
  );
}

const NUTRIENT_ROWS = [
  { key: 'energyKcal', label: 'Energy (kcal)', decimals: 0, unit: '' },
  { key: 'proteinG', label: 'Protein (g)', decimals: 1, unit: 'g' },
  { key: 'totalCarbG', label: 'Total Carbs (g)', decimals: 1, unit: 'g' },
  { key: 'sugarG', label: 'Total Sugars (g)', decimals: 1, unit: 'g' },
  { key: 'totalFatG', label: 'Total Fat (g)', decimals: 1, unit: 'g' },
  { key: 'saturatedFatG', label: 'Saturated Fat (g)', decimals: 1, unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium (mg)', decimals: 0, unit: 'mg' },
];

export default function Compare() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profiles, activeProfileId } = useFamily();
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  const products = location.state?.products || [];

  // Opens the full result for one compared product -- same "save a
  // fresh history entry, then navigate" pattern Category.jsx's own
  // openResult already uses, so this behaves like every other "open a
  // product from a list" flow in the app rather than inventing a new one.
  const openProduct = (product) => {
    const historyId = saveToHistory(product, 'search');
    navigate(`/result/${historyId}`);
  };

  if (products.length < 2) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 py-16 pb-24 text-center">
        <div className="text-6xl mb-4">⚖️</div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">Nothing selected to compare</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">Search and add 2-4 products to compare them side by side.</p>
        <button
          onClick={() => navigate('/compare')}
          className="tap-scale bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Add products to compare
        </button>
      </div>
    );
  }

  const rows = buildComparisonRows(products, activeProfile);
  const { bullets, ourTake } = describeDifferences(rows, activeProfile);
  const scoreLabels = scoreFitLabels(rows);
  const personalLabels = personalFitLabels(rows);
  const colTemplate = `104px repeat(${rows.length}, 1fr)`;

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate('/compare')}
        className="tap-scale inline-flex items-center gap-1.5 text-[15px] mb-3"
        style={{ color: 'var(--tint)' }}
      >
        ← Compare Products
      </button>

      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--label-1)' }}>Comparison Result</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--label-3)' }}>See differences and helpful insights.</p>

      <div className="rounded-[16px] overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        {/* Product header -- image + name + brand, tap to open the full result. */}
        <div className="grid gap-2 p-3" style={{ gridTemplateColumns: colTemplate }}>
          <div />
          {rows.map((r, i) => (
            <button key={r.lookupKey} onClick={() => openProduct(products[i])} className="tap-scale text-center">
              <ProductImage src={r.imageUrl} size={56} expandable={false} />
              <p className="text-[10.5px] font-semibold mt-1 leading-tight line-clamp-2" style={{ color: 'var(--label-1)' }}>
                {r.productName}
              </p>
              {r.brand && <p className="text-[9.5px] mt-0.5" style={{ color: 'var(--label-3)' }}>{r.brand}</p>}
            </button>
          ))}
        </div>

        <div className="h-px" style={{ background: 'var(--separator)' }} />

        {/* Score row (+ personal score row when a profile is active). */}
        <div className="grid gap-2 px-3 py-2.5 items-center">
          <div className="grid gap-2" style={{ gridTemplateColumns: colTemplate }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>Score</span>
            {rows.map((r) => (
              <span key={r.lookupKey} className="text-center">
                <ScoreCell score={r.overallScore} relativeLabel={scoreLabels[r.lookupKey]} />
              </span>
            ))}
          </div>
        </div>

        {activeProfile && (
          <div className="grid gap-2 px-3 py-2.5 items-center" style={{ gridTemplateColumns: colTemplate, background: 'var(--fill)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>For {activeProfile.nickname}</span>
            {rows.map((r) => (
              <span key={r.lookupKey} className="text-center">
                <ScoreCell score={r.personalScore} relativeLabel={personalLabels[r.lookupKey]} />
              </span>
            ))}
          </div>
        )}

        <p className="text-[10.5px] font-bold uppercase tracking-wide px-3 pt-3 pb-1" style={{ color: 'var(--label-3)', borderTop: '1px solid var(--separator)' }}>
          Key Nutrients (per 100g)
        </p>

        {NUTRIENT_ROWS.map((metric) => (
          <div key={metric.key} className="grid gap-2 px-3 py-2 items-center" style={{ gridTemplateColumns: colTemplate }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>{metric.label}</span>
            {rows.map((r) => {
              const value = r[metric.key];
              return (
                <span key={r.lookupKey} className="text-center text-[13px]" style={{ color: 'var(--label-1)' }}>
                  {typeof value === 'number' ? Number(value.toFixed(metric.decimals)) : <span style={{ color: 'var(--label-3)' }}>—</span>}
                </span>
              );
            })}
          </div>
        ))}

        <div className="grid gap-2 px-3 py-2.5 items-center" style={{ gridTemplateColumns: colTemplate, borderTop: '1px solid var(--separator)' }}>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>Additives</span>
          {rows.map((r) => (
            <span key={r.lookupKey} className="text-center text-[13px] font-semibold" style={{ color: 'var(--label-1)' }}>{r.additivesLabel}</span>
          ))}
        </div>

        <div className="grid gap-2 px-3 py-2.5 items-center" style={{ gridTemplateColumns: colTemplate, borderTop: '1px solid var(--separator)' }}>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--label-2)' }}>Processing</span>
          {rows.map((r) => (
            <span key={r.lookupKey} className="text-center text-[13px] font-semibold" style={{ color: 'var(--label-1)' }}>{r.processing || '—'}</span>
          ))}
        </div>
      </div>

      {/* Deterministic, always-English computed text -- same convention
          as report.summary (scoringEngine.js): describes real numbers
          only, never phrased as a command. */}
      {bullets.length > 0 && (
        <div className="mt-4 rounded-[14px] p-4" style={{ background: 'var(--tint-bg)' }}>
          <p className="text-[12px] font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--tint)' }}>
            📋 What differs?
          </p>
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="text-[13px] leading-relaxed flex gap-2" style={{ color: 'var(--label-1)' }}>
                <span style={{ color: 'var(--tint)' }}>•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ourTake && (
        <div className="mt-3 rounded-[14px] p-4" style={{ background: 'var(--v-good-bg)' }}>
          <p className="text-[12px] font-bold mb-1" style={{ color: 'var(--v-good)' }}>✅ Our take</p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-1)' }}>{ourTake}</p>
        </div>
      )}

      <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--label-3)' }}>
        "—" means that product's label/scan didn't have a real number for this.
      </p>
    </div>
  );
}
