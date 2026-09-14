// src/pages/Result.jsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getHistoryById, updateHistoryProductName, refreshHistoryEntry, saveToHistory, getScoreColor, getIngredientSeverity } from '../utils/storage';
import { updateProductName, getCachedReport, getSaferAlternatives, deleteReport, saveReport } from '../services/productCache';
import { analyzeText } from '../services/analyzeText';
import { lookupBarcode } from '../services/openFoodFacts';
import { getRelatedNews } from '../services/newsRepo';
import { useLanguage } from '../contexts/LanguageContext';
import ScoreCircle from '../components/ScoreCircle';
import IngredientCard from '../components/IngredientCard';
import ProductImage from '../components/ProductImage';
import ProductStripCard from '../components/ProductStripCard';
import NewsCard from '../components/NewsCard';

// Maps a dailyHabitCheck.js nutrientKey to the matching i18n string keys
// (see src/i18n/strings.js) for its display name and its three
// short/medium/long-term explanations.
const HABIT_KEY_PREFIX = {
  sodiumMg: 'habitSodium',
  addedSugarG: 'habitAddedSugarG',
  saturatedFatG: 'habitSaturatedFatG',
  transFatG: 'habitTransFatG',
};
const HABIT_NUTRIENT_LABEL_KEY = {
  sodiumMg: 'nutrientSodiumMg',
  addedSugarG: 'nutrientAddedSugarG',
  saturatedFatG: 'nutrientSaturatedFatG',
  transFatG: 'nutrientTransFatG',
};

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
  const { t, language } = useLanguage();
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('overview');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [alternatives, setAlternatives] = useState([]);
  const [relatedNews, setRelatedNews] = useState([]);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  useEffect(() => {
    const data = getHistoryById(id);
    if (!data) {
      navigate('/');
      return;
    }
    setResult(data);
  }, [id, navigate]);

  // Only worth asking for when the score is actually low -- a "Good"
  // or better product doesn't need an alternative suggested to it.
  useEffect(() => {
    if (!result || (result.overallScore || 0) >= 65) {
      setAlternatives([]);
      return;
    }
    let cancelled = false;
    getSaferAlternatives({ productName: result.productName, lookupKey: result.lookupKey }).then((alts) => {
      if (!cancelled) setAlternatives(alts);
    });
    return () => { cancelled = true; };
  }, [result?.lookupKey, result?.productName, result?.overallScore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyed off the product's brand and its flagged ingredients specifically
  // (not the full list) -- an article title is far more likely to be
  // about a specific concerning substance than an everyday bulk one.
  const flaggedIngredientKey = (result?.ingredients || [])
    .filter((i) => i.status === 'harmful' || i.status === 'concerning')
    .map((i) => i.name)
    .join(',');

  useEffect(() => {
    if (!result) {
      setRelatedNews([]);
      return;
    }
    let cancelled = false;
    getRelatedNews({ brand: result.brand, flaggedIngredientNames: flaggedIngredientKey ? flaggedIngredientKey.split(',') : [] }).then((items) => {
      if (!cancelled) setRelatedNews(items);
    });
    return () => { cancelled = true; };
  }, [result?.brand, flaggedIngredientKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAlternative = async (item) => {
    const cached = await getCachedReport(item.lookupKey);
    if (!cached) return;
    cached.lookupKey = item.lookupKey;
    const historyId = saveToHistory(cached, 'search');
    navigate(`/result/${historyId}`);
  };

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

  // Wipes this product's cached report and re-runs the full analysis
  // pipeline from scratch, so a scoring/parser fix (or a mistaken result)
  // shows up immediately instead of waiting on the stale cached report.
  const handleRefresh = async () => {
    if (!result.ingredientsText || refreshing) return;

    setRefreshing(true);
    setRefreshError('');
    try {
      // The cached report never stored the original nutrition-panel
      // numbers (they weren't collected before dailyHabitCheck.js
      // existed, and still aren't for text/photo-sourced scans) -- a
      // barcode-sourced product can re-fetch them fresh from Open Food
      // Facts here so refreshing an old scan can pick up a "daily habit"
      // section it never had, not just a rescored ingredient list.
      let nutrientsInfo = null;
      if (result.lookupKey?.startsWith('barcode:')) {
        const barcode = result.lookupKey.slice('barcode:'.length);
        const found = await lookupBarcode(barcode).catch(() => null);
        nutrientsInfo = found?.nutrientsInfo || null;
      }

      const analysis = await analyzeText(result.ingredientsText, result.productName, result.brand, null, result.imageUrl, nutrientsInfo);
      const fresh = analysis.report;
      fresh.ingredientsText = result.ingredientsText;
      fresh.lookupKey = result.lookupKey;

      if (result.lookupKey && !analysis.isIngredientOnly) {
        await deleteReport(result.lookupKey);
        await saveReport({
          lookupKey: result.lookupKey,
          source: result.inputType || 'text',
          productName: result.productName,
          ingredientsText: result.ingredientsText,
          report: fresh,
        });
      }

      refreshHistoryEntry(result.id, fresh);
      setResult((prev) => ({ ...prev, ...fresh }));
    } catch (err) {
      setRefreshError(err.message || 'Could not refresh this report. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!result) return null;

  const score = result.overallScore || 0;
  const scoreColors = getScoreColor(score);
  const ingredients = result.ingredients || [];

  // Stats, dots and the filter all read from one severity scale, so the
  // counts can never disagree with the colours shown next to each row.
  const severityOf = (ing) => getIngredientSeverity(ing).label;
  const tiers = [
    { key: 'Harmful', label: t('tierHarmful'), color: 'var(--v-very-poor)', bg: 'var(--v-very-poor-bg)', icon: '⚠' },
    { key: 'Concerning', label: t('tierConcerning'), color: 'var(--v-poor)', bg: 'var(--v-poor-bg)', icon: '!' },
    { key: 'Highly processed', label: t('tierProcessed'), color: 'var(--v-moderate)', bg: 'var(--v-moderate-bg)', icon: '−' },
    { key: 'Fine', label: t('tierFine'), color: 'var(--v-good)', bg: 'var(--v-good-bg)', icon: '✓' },
  ].map((tier) => ({ ...tier, count: ingredients.filter((i) => severityOf(i) === tier.key).length }));

  const flaggedCount = ingredients.filter((i) => ['Harmful', 'Concerning'].includes(severityOf(i))).length;
  const filteredIngredients = filter === 'all' ? ingredients : ingredients.filter((i) => severityOf(i) === filter);

  const savedDate = new Date(result.savedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const reportId = `SB-${(result.id || '').toString().slice(-8).toUpperCase()}`;

  // AI-generated content only, never the product name/brand or ingredient
  // names -- those aren't translated (see translateService.js). Falls
  // back to English per-field whenever a Hindi version isn't there yet
  // (an older cached report that hasn't been refreshed since translation
  // was added, or a translation call that failed), so nothing goes blank.
  const hi = language === 'hi' ? result.hi : null;
  const displaySummary = hi?.summary || result.summary;
  const displayRecommendation = hi?.recommendation || result.recommendation;
  const displayUsefulContext = hi?.usefulContext || result.usefulContext;
  const displayFlags = hi?.flags?.length === result.flags?.length ? hi.flags : result.flags;
  const displayPositives = hi?.positives?.length === result.positives?.length ? hi.positives : result.positives;
  const displayStory = result.story && {
    ...result.story,
    ...(hi?.story || {}),
    mythVsFact:
      hi?.story?.mythVsFact?.length === result.story.mythVsFact?.length
        ? hi.story.mythVsFact
        : result.story.mythVsFact,
  };

  // Rule-based, not AI/translation content (see dailyHabitCheck.js) --
  // resolved once here since it's used in both the compact teaser near
  // the score and the full modal it opens.
  const habitDisplay = result.dailyHabitCheck && (() => {
    const habit = result.dailyHabitCheck;
    const servingText = habit.servingGrams
      ? t('habitServingPack', { grams: habit.servingGrams })
      : t('habitServingPer100g');
    return {
      ...habit,
      nutrientLabel: t(HABIT_NUTRIENT_LABEL_KEY[habit.nutrientKey]),
      prefix: HABIT_KEY_PREFIX[habit.nutrientKey],
      servingText,
      displayAmount: habit.unit === 'mg' ? Math.round(habit.amount) : habit.amount,
    };
  })();

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
        {t('backToScan')}
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
                placeholder={t('enterProductName')}
                className="flex-1 min-w-0 text-[26px] font-bold tracking-tight bg-transparent border-b-2 focus:outline-none"
                style={{ color: 'var(--label-1)', borderColor: 'var(--tint)' }}
              />
              <button onClick={saveName} className="text-[17px]" style={{ color: 'var(--tint)' }} aria-label="Save name">{t('done')}</button>
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
                {t('edit')}
              </button>
            </h1>
          )}

          {result.productName === 'Unknown Product' && !editingName ? (
            <p className="text-[13px]" style={{ color: 'var(--v-poor)' }}>
              {t('unknownProductHint')}
            </p>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
            >
              {t('packagedFood')}
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
              ? t('noIngredientsAnalyzed')
              : flaggedCount === 0
                ? t('nothingFlagged', { count: ingredients.length })
                : t('someFlagged', { flagged: flaggedCount, total: ingredients.length })}
          </p>
          <Link to="/about#how-score-works" className="inline-block text-[15px] mt-2" style={{ color: 'var(--tint)' }}>
            {t('howCalculated')}
          </Link>
          {result.ingredientsText && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="tap-scale block text-[15px] mt-1.5"
              style={{ color: 'var(--tint)', opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing ? t('refreshing') : t('refreshAnalysis')}
            </button>
          )}
          {refreshError && (
            <p className="text-[13px] mt-1" style={{ color: 'var(--v-poor)' }}>{refreshError}</p>
          )}
        </div>
      </div>

      {/* A plain ingredient score can't say WHY a product exists -- an
          oral rehydration/glucose product scoring "Moderate" as an
          everyday food can still be exactly right for its actual,
          specific purpose. Distinct green "good news" tone (not the
          same tint-blue as the seasoning note below) since this is a
          positive reframe of the score above, not a caveat on it. */}
      {displayUsefulContext && (
        <div className="mx-4 mt-3 rounded-[14px] px-4 py-3.5 flex gap-3 items-start" style={{ background: 'var(--v-good-bg)' }}>
          <span className="text-[18px] leading-none mt-0.5 flex-shrink-0">🎯</span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold mb-0.5" style={{ color: 'var(--v-good)' }}>
              {t('usefulContextTitle')}
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
              {displayUsefulContext}
            </p>
          </div>
        </div>
      )}

      {/* A masala or seasoning scoring 95 isn't an invitation to eat it
          by the spoonful -- the score describes the product itself, and
          for these that's a pinch at a time inside a larger dish. */}
      {result.isCondimentOrSeasoning && (
        <div className="mx-4 mt-3 rounded-[14px] px-4 py-3 flex gap-3 items-start" style={{ background: 'var(--tint-bg)' }}>
          <span className="text-[16px] leading-none mt-0.5 flex-shrink-0">🥄</span>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
            {t('seasoningNote')}
          </p>
        </div>
      )}

      {result.hasEstimatedQuantities && (
        <div className="mx-4 mt-3 rounded-[14px] px-4 py-3" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--label-2)' }}>
            {t('estimatedQtyNote')}
          </p>
        </div>
      )}

      {/* Compact, attention-grabbing teaser near the score -- tapping
          it opens the full math + short/medium/long-term breakdown in a
          modal (see the createPortal block below), rather than pushing
          the score/verdict down the page with the full card inline. */}
      {habitDisplay && (
        <button
          onClick={() => setShowHabitModal(true)}
          className="tap-scale mx-4 mt-3 rounded-[14px] px-4 py-3 flex items-center gap-3 text-left"
          style={{ background: 'var(--v-poor-bg)', width: 'calc(100% - 2rem)' }}
        >
          <span className="text-[18px] leading-none flex-shrink-0">⚠️</span>
          <span className="flex-1 min-w-0 text-[13px] leading-snug font-semibold" style={{ color: 'var(--v-poor)' }}>
            {t('habitTeaser', { percent: habitDisplay.percent, nutrient: habitDisplay.nutrientLabel, servingText: habitDisplay.servingText })}
          </span>
          <svg viewBox="0 0 8 13" fill="none" className="w-2 h-3 flex-shrink-0" style={{ color: 'var(--v-poor)' }}>
            <path d="M1.5 1.5L6.5 6.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Safer alternatives -- only for a genuinely low score, and only
          when the catalog actually has a better-scoring product in the
          same category to suggest. No AI call: same category-keyword
          match Category.jsx browses by, filtered to a "Good"-or-better
          score, so every suggestion here is a real, already-verified
          product rather than something a model guessed at. */}
      {alternatives.length > 0 && (
        <>
          <SectionHeader>{t('saferAlternatives')}</SectionHeader>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
            {alternatives.map((item) => (
              <ProductStripCard key={item.lookupKey} item={item} onClick={() => openAlternative(item)} />
            ))}
          </div>
        </>
      )}

      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'overview', label: t('tabOverview') },
          { value: 'ingredients', label: t('tabIngredients', { count: ingredients.length }) },
          ...(result.story ? [{ value: 'story', label: t('tabStory') }] : []),
        ]}
      />

      {/* Summary */}
      {view === 'overview' && displaySummary && (
        <>
          <SectionHeader>{t('sectionSummary')}</SectionHeader>
          <Group>
            <div className="flex gap-3 items-start px-4 py-3.5">
              <span
                className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                style={{ background: 'var(--tint-bg)' }}
              >
                📄
              </span>
              <p className="text-[15px] leading-relaxed pt-1" style={{ color: 'var(--label-1)' }}>
                {displaySummary}
              </p>
            </div>
          </Group>
        </>
      )}

      {/* Breakdown — tapping a tile jumps to the Ingredients tab filtered to that category */}
      {view === 'overview' && ingredients.length > 0 && (
        <>
          <SectionHeader>{t('sectionBreakdown')}</SectionHeader>
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
      {view === 'overview' && displayRecommendation && (
        <>
          <SectionHeader>{t('sectionRecommendation')}</SectionHeader>
          <Group>
            <div className="flex gap-3 items-center px-4 py-3.5">
              <span
                className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                style={{ background: 'var(--v-good-bg)' }}
              >
                💡
              </span>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
                {displayRecommendation}
              </p>
            </div>
          </Group>
        </>
      )}

      {/* Flags + Positives — side by side when both exist, so "at a
          glance" actually reads as one glance rather than two scrolls */}
      {view === 'overview' && (result.flags?.length > 0 || result.positives?.length > 0) && (
        <>
          <SectionHeader>{t('sectionAtAGlance')}</SectionHeader>
          <div className={`grid gap-2.5 mx-4 ${result.flags?.length > 0 && result.positives?.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {result.flags?.length > 0 && (
              <ListCard title={t('watchOutFor')} dotColor="var(--v-poor)" items={displayFlags} />
            )}
            {result.positives?.length > 0 && (
              <ListCard title={t('goodThings')} dotColor="var(--v-good)" items={displayPositives} />
            )}
          </div>
        </>
      )}

      {/* Related reading -- news/research whose title mentions this
          product's brand or one of its flagged ingredients specifically,
          so it only shows up when there's something genuinely on-topic
          to read, not for every product. */}
      {view === 'overview' && relatedNews.length > 0 && (
        <>
          <SectionHeader>{t('sectionRelatedReading')}</SectionHeader>
          <div className="mx-4">
            {relatedNews.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Ingredients */}
      {view === 'ingredients' && (
        <>
          <SectionHeader
            action={filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="text-[13px]" style={{ color: 'var(--tint)' }}>
                {t('showAll')}
              </button>
            )}
          >
            {filter === 'all'
              ? t('allIngredientsCount', { count: ingredients.length })
              : t('filteredCount', {
                  count: filteredIngredients.length,
                  label: (tiers.find((tier) => tier.key === filter)?.label || '').toLowerCase(),
                })}
          </SectionHeader>
          {filteredIngredients.length === 0 ? (
            <Group>
              <p className="px-4 py-4 text-[15px] text-center" style={{ color: 'var(--label-2)' }}>
                {t('noneInCategory')}
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
              <SectionHeader>{t('asReadFromLabel')}</SectionHeader>
              <Group>
                <p className="px-4 py-3.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--label-2)' }}>
                  {result.ingredientsText}
                </p>
              </Group>
              <p className="px-5 pt-2 text-[13px] leading-relaxed" style={{ color: 'var(--label-3)' }}>
                {t('compareLabelNote')}
              </p>
            </>
          )}
        </>
      )}

      {/* Story -- history/legacy, why it's used, controversy, myth vs
          fact. Only ever rendered when the AI had genuine, specific
          things to say (see geminiService.js's "story" rules) -- never
          fabricated filler for an unfamiliar generic product, which is
          also why the tab itself only appears when this exists. */}
      {view === 'story' && displayStory && (
        <>
          {displayStory.headline && (
            <div className="mx-4 mt-4 rounded-[16px] px-5 py-4" style={{ background: 'var(--tint-bg)' }}>
              <p className="text-[17px] font-bold leading-snug" style={{ color: 'var(--label-1)' }}>
                {displayStory.headline}
              </p>
            </div>
          )}

          {displayStory.history && (
            <>
              <SectionHeader>{t('storyHistory')}</SectionHeader>
              <Group>
                <div className="flex gap-3 items-start px-4 py-3.5">
                  <span
                    className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                    style={{ background: 'var(--tint-bg)' }}
                  >
                    📜
                  </span>
                  <p className="text-[15px] leading-relaxed pt-1" style={{ color: 'var(--label-1)' }}>
                    {displayStory.history}
                  </p>
                </div>
              </Group>
            </>
          )}

          {displayStory.whyItsUsed && (
            <>
              <SectionHeader>{t('storyWhyUsed')}</SectionHeader>
              <Group>
                <div className="flex gap-3 items-start px-4 py-3.5">
                  <span
                    className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                    style={{ background: 'var(--v-good-bg)' }}
                  >
                    ⚙️
                  </span>
                  <p className="text-[15px] leading-relaxed pt-1" style={{ color: 'var(--label-1)' }}>
                    {displayStory.whyItsUsed}
                  </p>
                </div>
              </Group>
            </>
          )}

          {displayStory.controversy && (
            <>
              <SectionHeader>{t('storyControversy')}</SectionHeader>
              <Group>
                <div className="flex gap-3 items-start px-4 py-3.5">
                  <span
                    className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center text-[16px]"
                    style={{ background: 'var(--v-poor-bg)' }}
                  >
                    ⚠️
                  </span>
                  <p className="text-[15px] leading-relaxed pt-1" style={{ color: 'var(--label-1)' }}>
                    {displayStory.controversy}
                  </p>
                </div>
              </Group>
            </>
          )}

          {displayStory.mythVsFact?.length > 0 && (
            <>
              <SectionHeader>{t('storyMythVsFact')}</SectionHeader>
              <div className="mx-4 space-y-2.5">
                {displayStory.mythVsFact.map((pair, i) => (
                  <div key={i} className="rounded-[14px] p-3.5" style={{ background: 'var(--bg-card)' }}>
                    <div className="flex gap-2.5 items-start mb-2.5">
                      <span
                        className="w-5 h-5 mt-0.5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                        style={{ background: 'var(--v-poor-bg)', color: 'var(--v-poor)' }}
                      >
                        ✗
                      </span>
                      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--label-2)' }}>
                        <span className="font-semibold" style={{ color: 'var(--label-1)' }}>{t('mythLabel')}</span>
                        {pair.myth}
                      </p>
                    </div>
                    <div className="flex gap-2.5 items-start">
                      <span
                        className="w-5 h-5 mt-0.5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                        style={{ background: 'var(--v-good-bg)', color: 'var(--v-good)' }}
                      >
                        ✓
                      </span>
                      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
                        <span className="font-semibold">{t('factLabel')}</span>
                        {pair.fact}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Verification + disclaimer */}
      <div className="px-5 pt-8 text-center">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--label-3)' }}>
          {t('crossChecked')}
        </p>
        <p className="text-[12px] leading-relaxed mt-2" style={{ color: 'var(--label-3)' }}>
          {t('disclaimer')}
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
          {t('scanAnother')}
        </button>
      </div>

      {/* Full "if this became a daily habit" breakdown -- opened by the
          compact teaser near the score, above. A modal rather than its
          own route/URL: this is supplementary detail about the product
          already on screen, not content that needs its own deep link. */}
      {showHabitModal && habitDisplay && createPortal(
        <div
          className="fixed inset-0 z-[999] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => setShowHabitModal(false)}
        >
          <div
            className="relative w-full sm:max-w-[480px] max-h-[85vh] overflow-y-auto rounded-t-[24px] sm:rounded-[20px] p-5"
            style={{ background: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowHabitModal(false)}
              aria-label="Close"
              className="tap-scale absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-[18px]"
              style={{ background: 'var(--fill)', color: 'var(--label-2)' }}
            >
              ×
            </button>

            <p className="text-[17px] font-bold pr-8 mb-3" style={{ color: 'var(--label-1)' }}>
              {t('habitTitle')}
            </p>
            <p className="text-[14px] leading-relaxed mb-3" style={{ color: 'var(--label-2)' }}>
              {t('habitIntro')}
            </p>

            <div className="rounded-[12px] p-3.5 space-y-1 mb-3" style={{ background: 'var(--fill)' }}>
              <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--label-2)' }}>
                📊 {t('habitMathHeader')}
              </p>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
                {t('habitMathLine1', {
                  servingText: habitDisplay.servingText,
                  amount: habitDisplay.displayAmount,
                  unit: habitDisplay.unit,
                  nutrient: habitDisplay.nutrientLabel,
                })}
              </p>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
                {t('habitMathLine2', { limit: habitDisplay.limit, unit: habitDisplay.unit })}
              </p>
              <p className="text-[14px] font-semibold leading-relaxed pt-1" style={{ color: 'var(--v-poor)' }}>
                → {t('habitMathLine3', { percent: habitDisplay.percent })}
              </p>
            </div>

            <div className="space-y-3">
              {[
                { icon: '📅', titleKey: 'habitShortTermTitle', textKey: `${habitDisplay.prefix}Short` },
                { icon: '📈', titleKey: 'habitMediumTermTitle', textKey: `${habitDisplay.prefix}Medium` },
                { icon: '❤️', titleKey: 'habitLongTermTitle', textKey: `${habitDisplay.prefix}Long` },
              ].map(({ icon, titleKey, textKey }) => (
                <div key={titleKey}>
                  <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--label-2)' }}>
                    {icon} {t(titleKey)}
                  </p>
                  <p className="text-[14px] leading-relaxed" style={{ color: 'var(--label-1)' }}>
                    {t(textKey)}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[12px] leading-relaxed italic mt-3" style={{ color: 'var(--label-3)' }}>
              {t('habitDisclaimer')}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
