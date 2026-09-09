// src/pages/Result.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getHistoryById, updateHistoryProductName, getScoreColor, getIngredientSeverity } from '../utils/storage';
import { updateProductName } from '../services/productCache';
import ScoreCircle from '../components/ScoreCircle';
import IngredientCard from '../components/IngredientCard';

function SectionHeader({ children, action }) {
  return (
    <div className="flex items-end justify-between px-5 pb-1.5 pt-7">
      <span className="text-[13px]" style={{ color: 'var(--label-2)' }}>{children}</span>
      {action}
    </div>
  );
}

function Group({ children, className = '' }) {
  return (
    <div
      className={`ios-group mx-4 rounded-[14px] overflow-hidden ${className}`}
      style={{ background: 'var(--bg-card)' }}
    >
      {children}
    </div>
  );
}

function BulletRow({ color, children }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-h-[44px]">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[17px] leading-snug" style={{ color: 'var(--label-1)' }}>{children}</span>
    </div>
  );
}

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('all');
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

  const score = result.overallScore || 0;
  const scoreColors = getScoreColor(score);
  const ingredients = result.ingredients || [];

  // Stats, dots and the filter all read from one severity scale, so the
  // counts can never disagree with the colours shown next to each row.
  const severityOf = (ing) => getIngredientSeverity(ing).label;
  const tiers = [
    { key: 'Harmful', label: 'Harmful', color: 'var(--v-very-poor)' },
    { key: 'Concerning', label: 'Concerning', color: 'var(--v-poor)' },
    { key: 'Highly processed', label: 'Processed', color: 'var(--v-moderate)' },
    { key: 'Fine', label: 'Fine', color: 'var(--v-good)' },
  ].map((t) => ({ ...t, count: ingredients.filter((i) => severityOf(i) === t.key).length }));

  const flaggedCount = ingredients.filter((i) => ['Harmful', 'Concerning'].includes(severityOf(i))).length;
  const filteredIngredients = filter === 'all' ? ingredients : ingredients.filter((i) => severityOf(i) === filter);

  const savedDate = new Date(result.savedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const reportId = `SB-${(result.id || '').toString().slice(-8).toUpperCase()}`;

  return (
    <div className="max-w-[560px] mx-auto pb-12" style={{ background: 'var(--bg-grouped)' }}>

      {/* Nav */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[17px]"
        style={{ color: 'var(--tint)' }}
      >
        <svg viewBox="0 0 12 20" fill="none" className="w-3 h-5">
          <path d="M10 2L2 10l8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Scan
      </button>

      {/* Title */}
      <div className="px-5 pt-1 pb-5">
        {result.brand && !editingName && (
          <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--label-2)' }}>
            {result.brand.toUpperCase()}
          </p>
        )}

        {editingName ? (
          <div className="flex items-center gap-2">
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
              className="flex-1 min-w-0 text-[28px] font-bold tracking-tight bg-transparent border-b-2 focus:outline-none"
              style={{ color: 'var(--label-1)', borderColor: 'var(--tint)' }}
            />
            <button onClick={saveName} className="text-[17px]" style={{ color: 'var(--tint)' }} aria-label="Save name">Done</button>
          </div>
        ) : (
          <h1 className="text-[34px] leading-[1.1] font-bold tracking-tight flex items-start gap-2" style={{ color: 'var(--label-1)' }}>
            <span className="min-w-0">{result.productName || 'Unknown Product'}</span>
            <button
              onClick={startEditingName}
              className="text-[15px] mt-2.5 flex-shrink-0"
              style={{ color: 'var(--tint)' }}
              aria-label="Edit product name"
            >
              Edit
            </button>
          </h1>
        )}

        {result.productName === 'Unknown Product' && !editingName && (
          <p className="text-[13px] mt-1.5" style={{ color: 'var(--v-poor)' }}>
            We couldn't identify this product — tap Edit to name it yourself.
          </p>
        )}
      </div>

      {/* Score hero */}
      <div className="mx-4 rounded-[20px] p-5 flex items-center gap-5" style={{ background: 'var(--bg-card)' }}>
        <ScoreCircle score={score} size="large" />
        <div className="min-w-0">
          <p className="text-[24px] font-bold tracking-tight leading-tight" style={{ color: scoreColors.color }}>
            {result.verdict || scoreColors.label}
          </p>
          <p className="text-[15px] mt-0.5" style={{ color: 'var(--label-2)' }}>
            {ingredients.length === 0
              ? 'No ingredients analyzed'
              : flaggedCount === 0
                ? `Nothing flagged across ${ingredients.length} ingredients`
                : `${flaggedCount} of ${ingredients.length} ingredients raise a flag`}
          </p>
          <Link to="/about#how-score-works" className="inline-block text-[15px] mt-2" style={{ color: 'var(--tint)' }}>
            How is this calculated?
          </Link>
        </div>
      </div>

      {result.hasEstimatedQuantities && (
        <div className="mx-4 mt-3 rounded-[14px] px-4 py-3" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-2)' }}>
            This label doesn't state an exact percentage for every ingredient, so part of this score is a reasonable estimate rather than the product's exact measured composition.
          </p>
        </div>
      )}

      {/* Summary */}
      {result.summary && (
        <>
          <SectionHeader>Summary</SectionHeader>
          <Group>
            <p className="px-4 py-3.5 text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
              {result.summary}
            </p>
          </Group>
        </>
      )}

      {/* Breakdown — also the ingredient filter */}
      {ingredients.length > 0 && (
        <>
          <SectionHeader
            action={filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="text-[13px]" style={{ color: 'var(--tint)' }}>
                Show all
              </button>
            )}
          >
            Breakdown
          </SectionHeader>
          <div className="mx-4 grid grid-cols-4 gap-2">
            {tiers.map((tier) => {
              const active = filter === tier.key;
              return (
                <button
                  key={tier.key}
                  onClick={() => setFilter(active ? 'all' : tier.key)}
                  className="rounded-[14px] py-3 px-1 text-center transition-colors"
                  style={{
                    background: active ? tier.color : 'var(--bg-card)',
                    color: active ? '#fff' : 'var(--label-1)',
                  }}
                >
                  <span className="block text-[24px] font-bold leading-none tracking-tight" style={{ color: active ? '#fff' : tier.color }}>
                    {tier.count}
                  </span>
                  <span className="block text-[11px] mt-1" style={{ color: active ? '#fff' : 'var(--label-2)' }}>
                    {tier.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Recommendation */}
      {result.recommendation && (
        <>
          <SectionHeader>Our recommendation</SectionHeader>
          <Group>
            <p className="px-4 py-3.5 text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
              {result.recommendation}
            </p>
          </Group>
        </>
      )}

      {/* Flags */}
      {result.flags?.length > 0 && (
        <>
          <SectionHeader>Watch out for</SectionHeader>
          <Group>
            {result.flags.map((flag, i) => (
              <BulletRow key={i} color="var(--v-poor)">{flag}</BulletRow>
            ))}
          </Group>
        </>
      )}

      {/* Positives */}
      {result.positives?.length > 0 && (
        <>
          <SectionHeader>Good things</SectionHeader>
          <Group>
            {result.positives.map((pos, i) => (
              <BulletRow key={i} color="var(--v-good)">{pos}</BulletRow>
            ))}
          </Group>
        </>
      )}

      {/* Ingredients */}
      <SectionHeader>
        {filter === 'all'
          ? `All ${ingredients.length} ingredients`
          : `${filteredIngredients.length} ${filter.toLowerCase()}`}
      </SectionHeader>
      {filteredIngredients.length === 0 ? (
        <Group>
          <p className="px-4 py-4 text-[15px] text-center" style={{ color: 'var(--label-2)' }}>
            None in this category.
          </p>
        </Group>
      ) : (
        <Group>
          {filteredIngredients.map((ingredient, i) => (
            <IngredientCard key={i} ingredient={ingredient} />
          ))}
        </Group>
      )}

      {/* Raw label */}
      {result.ingredientsText && (
        <>
          <SectionHeader>As read from the label</SectionHeader>
          <Group>
            <p className="px-4 py-3.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--label-2)' }}>
              {result.ingredientsText}
            </p>
          </Group>
          <p className="px-5 pt-2 text-[13px] leading-relaxed" style={{ color: 'var(--label-3)' }}>
            Compare this against the list above — if something on your pack isn't here, it was missed while reading the label.
          </p>
        </>
      )}

      {/* Verification + disclaimer */}
      <div className="px-5 pt-8 text-center">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--label-3)' }}>
          Cross-checked against FSSAI and EU/EFSA standards · AI-analyzed
        </p>
        <p className="text-[12px] leading-relaxed mt-2" style={{ color: 'var(--label-3)' }}>
          SafeBite is an informational tool, not medical advice. Always consult a healthcare professional for dietary guidance.
        </p>
        <p className="text-[12px] mt-2" style={{ color: 'var(--label-3)' }}>
          {reportId} · {savedDate}
        </p>
      </div>

      <div className="px-4 pt-6">
        <button
          onClick={() => navigate('/')}
          className="w-full py-3.5 rounded-[14px] text-[17px] font-semibold text-white"
          style={{ background: 'var(--tint)' }}
        >
          Scan another product
        </button>
      </div>
    </div>
  );
}
