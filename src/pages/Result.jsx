// src/pages/Result.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getHistoryById, updateHistoryProductName, getScoreColor, getIngredientSeverity } from '../utils/storage';
import { updateProductName } from '../services/productCache';
import ScoreCircle from '../components/ScoreCircle';
import IngredientCard from '../components/IngredientCard';
import ProductImage from '../components/ProductImage';

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

// iOS-style segmented control -- splits the page into two short views
// (Overview / Ingredients) instead of one long scroll, so opening a
// report always lands on a screen that fits without scrolling past a
// long ingredient list first.
function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="mx-4 mt-4 p-1 rounded-[12px] flex gap-1" style={{ background: 'var(--fill)' }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="tap-scale flex-1 py-2 rounded-[9px] text-[14px] font-semibold transition-colors"
            style={{
              background: active ? 'var(--bg-card)' : 'transparent',
              color: active ? 'var(--label-1)' : 'var(--label-2)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// A compact card for "Watch out for" / "Good things" -- sized to sit
// side by side so both read in one glance instead of two separate
// full-width scrolls.
function ListCard({ title, dotColor, items }) {
  return (
    <div className="rounded-[14px] p-3.5" style={{ background: 'var(--bg-card)' }}>
      <p className="flex items-center gap-1.5 text-[14px] font-semibold mb-2.5" style={{ color: 'var(--label-1)' }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-[13px] leading-snug pl-3 relative" style={{ color: 'var(--label-1)' }}>
            <span className="absolute left-0 top-[7px] w-1 h-1 rounded-full" style={{ background: 'var(--label-3)' }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('overview');
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
    { key: 'Harmful', label: 'Harmful', color: 'var(--v-very-poor)', bg: 'var(--v-very-poor-bg)', icon: '⚠' },
    { key: 'Concerning', label: 'Concerning', color: 'var(--v-poor)', bg: 'var(--v-poor-bg)', icon: '!' },
    { key: 'Highly processed', label: 'Processed', color: 'var(--v-moderate)', bg: 'var(--v-moderate-bg)', icon: '−' },
    { key: 'Fine', label: 'Fine', color: 'var(--v-good)', bg: 'var(--v-good-bg)', icon: '✓' },
  ].map((t) => ({ ...t, count: ingredients.filter((i) => severityOf(i) === t.key).length }));

  const flaggedCount = ingredients.filter((i) => ['Harmful', 'Concerning'].includes(severityOf(i))).length;
  const filteredIngredients = filter === 'all' ? ingredients : ingredients.filter((i) => severityOf(i) === filter);

  const savedDate = new Date(result.savedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const reportId = `SB-${(result.id || '').toString().slice(-8).toUpperCase()}`;

  return (
    <div className="page-in max-w-[560px] mx-auto pb-24" style={{ background: 'var(--bg-grouped)' }}>

      {/* Nav */}
      <button
        onClick={() => navigate('/')}
        className="tap-scale inline-flex items-center gap-1.5 px-4 pt-3 pb-1 text-[17px]"
        style={{ color: 'var(--tint)' }}
      >
        <svg viewBox="0 0 12 20" fill="none" className="w-3 h-5">
          <path d="M10 2L2 10l8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Scan
      </button>

      {/* Title */}
      <div className="px-5 pt-1 pb-5">
        {result.imageUrl && (
          <div className="flex justify-center mb-4">
            <ProductImage src={result.imageUrl} size={152} />
          </div>
        )}
        <div className="min-w-0">
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
                className="flex-1 min-w-0 text-[26px] font-bold tracking-tight bg-transparent border-b-2 focus:outline-none"
                style={{ color: 'var(--label-1)', borderColor: 'var(--tint)' }}
              />
              <button onClick={saveName} className="text-[17px]" style={{ color: 'var(--tint)' }} aria-label="Save name">Done</button>
            </div>
          ) : (
            <h1 className="text-[26px] leading-[1.15] font-bold tracking-tight flex items-start gap-2 mb-2" style={{ color: 'var(--label-1)' }}>
              <span className="min-w-0">{result.productName || 'Unknown Product'}</span>
              <button
                onClick={startEditingName}
                className="text-[14px] mt-1.5 flex-shrink-0"
                style={{ color: 'var(--tint)' }}
                aria-label="Edit product name"
              >
                Edit
              </button>
            </h1>
          )}

          {result.productName === 'Unknown Product' && !editingName ? (
            <p className="text-[13px]" style={{ color: 'var(--v-poor)' }}>
              We couldn't identify this product — tap Edit to name it yourself.
            </p>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
            >
              📦 Packaged Food
            </span>
          )}
        </div>
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

      {/* A masala or seasoning scoring 95 isn't an invitation to eat it
          by the spoonful -- the score describes the product itself, and
          for these that's a pinch at a time inside a larger dish. */}
      {result.isCondimentOrSeasoning && (
        <div className="mx-4 mt-3 rounded-[14px] px-4 py-3 flex gap-3 items-start" style={{ background: 'var(--tint-bg)' }}>
          <span className="text-[16px] leading-none mt-0.5 flex-shrink-0">🥄</span>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
            Used in small amounts — this score reflects the seasoning itself, not the dish you add it to.
          </p>
        </div>
      )}

      {result.hasEstimatedQuantities && (
        <div className="mx-4 mt-3 rounded-[14px] px-4 py-3" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-2)' }}>
            This label doesn't state an exact percentage for every ingredient, so part of this score is a reasonable estimate rather than the product's exact measured composition.
          </p>
        </div>
      )}

      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'ingredients', label: `Ingredients (${ingredients.length})` },
        ]}
      />

      {/* Summary */}
      {view === 'overview' && result.summary && (
        <>
          <SectionHeader>Summary</SectionHeader>
          <Group>
            <div className="flex gap-3 items-start px-4 py-3.5">
              <span
                className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                style={{ background: 'var(--tint-bg)' }}
              >
                📄
              </span>
              <p className="text-[15px] leading-relaxed pt-1" style={{ color: 'var(--label-1)' }}>
                {result.summary}
              </p>
            </div>
          </Group>
        </>
      )}

      {/* Breakdown — tapping a tile jumps to the Ingredients tab filtered to that category */}
      {view === 'overview' && ingredients.length > 0 && (
        <>
          <SectionHeader>Breakdown</SectionHeader>
          <div className="mx-4 grid grid-cols-4 gap-2">
            {tiers.map((tier) => {
              const active = filter === tier.key;
              return (
                <button
                  key={tier.key}
                  onClick={() => {
                    setFilter(tier.key);
                    setView('ingredients');
                  }}
                  className="tap-scale rounded-[14px] py-3 px-1 text-center transition-colors"
                  style={{
                    background: active ? tier.color : 'var(--bg-card)',
                    color: active ? '#fff' : 'var(--label-1)',
                  }}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold mx-auto mb-1.5"
                    style={{ background: active ? 'rgba(255,255,255,0.25)' : tier.bg, color: active ? '#fff' : tier.color }}
                  >
                    {tier.icon}
                  </span>
                  <span className="block text-[20px] font-bold leading-none tracking-tight" style={{ color: active ? '#fff' : tier.color }}>
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
      {view === 'overview' && result.recommendation && (
        <>
          <SectionHeader>Our recommendation</SectionHeader>
          <Group>
            <div className="flex gap-3 items-center px-4 py-3.5">
              <span
                className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                style={{ background: 'var(--v-good-bg)' }}
              >
                💡
              </span>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
                {result.recommendation}
              </p>
            </div>
          </Group>
        </>
      )}

      {/* Flags + Positives — side by side when both exist, so "at a
          glance" actually reads as one glance rather than two scrolls */}
      {view === 'overview' && (result.flags?.length > 0 || result.positives?.length > 0) && (
        <>
          <SectionHeader>At a glance</SectionHeader>
          <div className={`grid gap-2.5 mx-4 ${result.flags?.length > 0 && result.positives?.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {result.flags?.length > 0 && (
              <ListCard title="Watch out for" dotColor="var(--v-poor)" items={result.flags} />
            )}
            {result.positives?.length > 0 && (
              <ListCard title="Good things" dotColor="var(--v-good)" items={result.positives} />
            )}
          </div>
        </>
      )}

      {/* Ingredients */}
      {view === 'ingredients' && (
        <>
          <SectionHeader
            action={filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="text-[13px]" style={{ color: 'var(--tint)' }}>
                Show all
              </button>
            )}
          >
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
          ) : filter === 'all' ? (
            // Grouped by severity (worst first) rather than label order --
            // easier to scan "what's actually wrong with this" at a glance.
            // The filtered single-category view below keeps a flat list
            // since every card in it already shares one severity.
            tiers
              .filter((tier) => tier.count > 0)
              .map((tier) => (
                <div key={tier.key}>
                  <div className="flex items-center gap-2 px-5 pb-1.5 pt-5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: tier.bg, color: tier.color }}
                    >
                      {tier.icon}
                    </span>
                    <span className="text-[13px] font-semibold" style={{ color: tier.color }}>
                      {tier.label} · {tier.count}
                    </span>
                  </div>
                  <Group>
                    {ingredients
                      .filter((ingredient) => severityOf(ingredient) === tier.key)
                      .map((ingredient, i) => (
                        <IngredientCard key={i} ingredient={ingredient} style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }} />
                      ))}
                  </Group>
                </div>
              ))
          ) : (
            <Group>
              {filteredIngredients.map((ingredient, i) => (
                <IngredientCard key={i} ingredient={ingredient} style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }} />
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
          className="tap-scale w-full py-3.5 rounded-[14px] text-[17px] font-semibold text-white"
          style={{ background: 'var(--tint)' }}
        >
          Scan another product
        </button>
      </div>
    </div>
  );
}
