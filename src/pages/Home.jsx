// src/pages/Home.jsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { extractIngredientsFromImage } from '../services/geminiService';
import { analyzeText } from '../services/analyzeText';
import { lookupBarcode, searchProductsByName } from '../services/openFoodFacts';
import { getCachedReport, saveReport, barcodeKey, textKey, searchCachedProducts, getPopularSearchTerms, getRecentlyAddedProducts, getDailySpotlight, getCatalogStats, dayOfYearSeed } from '../services/productCache';
import { saveToHistory, getScoreColor } from '../utils/storage';
import LoadingScreen from '../components/LoadingScreen';
import ProductStripCard from '../components/ProductStripCard';
import ProductImage from '../components/ProductImage';
import { CATEGORIES } from '../data/categories';
import { getTodaysTip } from '../data/didYouKnowTips';
import { getTodaysFact } from '../services/dailyFactRepo';
import BarcodeScanner, { isBarcodeScanSupported } from '../components/BarcodeScanner';
import { useFamily } from '../contexts/FamilyContext';

// A plain pulsing placeholder block -- shared shape for every home
// screen section's skeleton, so a section always reserves the same
// space its real content will take up (no layout jump once the real
// data replaces it).
function SkeletonBlock({ className }) {
  return <div className={`shimmer rounded-xl ${className || ''}`} />;
}

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <rect x="2" y="4" width="2" height="16" fill="currentColor" />
      <rect x="6" y="4" width="1" height="16" fill="currentColor" />
      <rect x="9" y="4" width="3" height="16" fill="currentColor" />
      <rect x="14" y="4" width="1" height="16" fill="currentColor" />
      <rect x="17" y="4" width="2" height="16" fill="currentColor" />
      <rect x="21" y="4" width="1" height="16" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState('search'); // 'search' | 'text' | 'image' | 'barcode'
  const [text, setText] = useState('');
  const [textProductName, setTextProductName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [suggestions, setSuggestions] = useState({ cached: [], off: [] });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [popularTerms, setPopularTerms] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [spotlight, setSpotlight] = useState({ best: null, worst: null });
  const [stats, setStats] = useState(null);
  // True until ALL of the home screen's discovery sections have their
  // real data, not just the first one to resolve -- these are 4
  // independent Supabase queries, and letting each section render the
  // moment its OWN query finished (the previous behaviour) made them pop
  // in one at a time at different moments, a real reported "looks odd"
  // complaint. Waiting for all of them and revealing together, with a
  // skeleton in the meantime, reads as one clean load instead.
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analyzing ingredients...');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const todaysTip = getTodaysTip(dayOfYearSeed());
  // The AI-generated fact (see scripts/generate-daily-fact.js) for
  // today, when one exists -- null keeps todaysTip (the static
  // curated rotation) as the fallback, so the card always has
  // something true to show even on a day the job hasn't run yet.
  const [dailyFact, setDailyFact] = useState(null);
  const [showFactDetail, setShowFactDetail] = useState(false);

  const { profiles, activeProfileId, setActiveProfile } = useFamily();

  // Real usage/catalog data for the home screen's discovery sections --
  // each loaded once, not worth the type-ahead effect's debounce/
  // cancellation machinery.
  useEffect(() => {
    // Every section -- INCLUDING the daily fact and the hero stats --
    // is awaited together and revealed in one go. A failed query falls
    // back to that section's empty state instead of leaving the whole
    // screen stuck on skeletons.
    const safe = (promise, fallback) => Promise.resolve(promise).catch(() => fallback);
    Promise.all([
      safe(getPopularSearchTerms(8), []),
      safe(getRecentlyAddedProducts(10), []),
      safe(getDailySpotlight(), { best: null, worst: null }),
      safe(getCatalogStats(), null),
      safe(getTodaysFact(), null),
    ]).then(([popular, recent, spot, catStats, fact]) => {
      setPopularTerms(popular);
      setRecentlyAdded(recent);
      setSpotlight(spot);
      setStats(catStats);
      setDailyFact(fact);
      setSectionsLoading(false);
    });
  }, []);

  // Review step: set after an image is read or a barcode is looked up,
  // so the user can check/fix the ingredients text before we analyze it.
  const [review, setReview] = useState(null); // { productName, ingredientsText, notes, readable }
  const [reviewText, setReviewText] = useState('');
  const [reviewProductName, setReviewProductName] = useState('');

  // Set when a scanned barcode isn't in the catalog -- shows a "Submit
  // this product" CTA (see SubmitProduct.jsx) instead of leaving the
  // person with only the plain error text and no next step. Cleared
  // whenever the barcode field changes, so the CTA doesn't linger for a
  // barcode the person has since edited or replaced.
  const [notFoundBarcode, setNotFoundBarcode] = useState('');

  // Shopping Mode -- "scan, quick result, ready for the next one" for a
  // real trip up and down the aisles, instead of scan -> full Result
  // page -> back -> scan again. Feeds the EXISTING Compare feature
  // rather than inventing a second comparison flow: "Compare selected"
  // below navigates to the same /compare/result Compare.jsx already
  // renders, passing full report objects it already accepts.
  const [shoppingMode, setShoppingMode] = useState(() => {
    try { return localStorage.getItem('foodguard-shopping-mode') === '1'; } catch { return false; }
  });
  const [shoppingSession, setShoppingSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('foodguard-shopping-session') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('foodguard-shopping-mode', shoppingMode ? '1' : '0'); } catch { /* private mode etc */ }
  }, [shoppingMode]);
  useEffect(() => {
    try { localStorage.setItem('foodguard-shopping-session', JSON.stringify(shoppingSession)); } catch { /* private mode etc */ }
  }, [shoppingSession]);

  const addToShoppingSession = (result, historyId) => {
    setShoppingSession((prev) => [{ historyId, addedAt: Date.now(), report: result }, ...prev]);
  };
  const removeFromShoppingSession = (historyId) =>
    setShoppingSession((prev) => prev.filter((item) => item.historyId !== historyId));
  const clearShoppingSession = () => setShoppingSession([]);

  // Clears everything about THIS scan (text/photo/barcode input, any
  // open review) while leaving `mode` untouched -- Shopping Mode stays
  // on the same scan method (e.g. still ready for the next photo)
  // rather than dropping back to the mode-picker after every item.
  const resetForNextScan = () => {
    setText('');
    setTextProductName('');
    setImageFile(null);
    setImagePreview(null);
    setBarcodeInput('');
    setReview(null);
    setReviewText('');
    setReviewProductName('');
    setError('');
    setNotFoundBarcode('');
  };

  // Type-ahead search. Debounced so a fast typist doesn't fire a request
  // per keystroke, and cancellable so a slow earlier response can't
  // overwrite the results for what the user has since typed.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions({ cached: [], off: [] });
      setSearching(false);
      setSearchError('');
      return;
    }

    setSearching(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      let offFailed = '';
      const [cached, off] = await Promise.all([
        searchCachedProducts(q).catch(() => []),
        searchProductsByName(q).catch((err) => {
          offFailed = err.message;
          return [];
        }),
      ]);

      if (cancelled) return;

      // Don't offer a fresh lookup for something already analyzed —
      // it'd just be a slower duplicate of the row right above it.
      const cachedKeys = new Set(cached.map((c) => c.lookupKey));
      setSuggestions({
        cached,
        off: off.filter((o) => !cachedKeys.has(barcodeKey(o.code))),
      });
      setSearchError(cached.length === 0 ? offFailed : '');
      setSearching(false);
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const openCachedSuggestion = async (item) => {
    setError('');
    setLoading(true);
    setLoadingMessage('Loading saved report...');
    try {
      const cached = await getCachedReport(item.lookupKey);
      if (!cached) {
        setError("Couldn't load that saved report. Try another result, or paste the ingredients instead.");
        setLoading(false);
        return;
      }
      cached.lookupKey = item.lookupKey;
      const id = saveToHistory(cached, 'search');
      navigate(`/result/${id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const openSearchResult = async (item) => {
    setError('');
    const key = barcodeKey(item.code);
    setLoading(true);
    setLoadingMessage('Checking cache...');
    try {
      const cached = await getCachedReport(key);
      if (cached) {
        cached.lookupKey = key;
        const id = saveToHistory(cached, 'search');
        navigate(`/result/${id}`);
        return;
      }

      // Never analyzed before — hand off to the same review step the
      // barcode flow uses, so the ingredients get checked against the
      // real pack before we score anything.
      startReview({
        productName: item.productName,
        brand: item.brand,
        imageUrl: item.imageUrl,
        ingredientsText: item.ingredientsText,
        offIngredients: item.offIngredients,
        source: 'barcode',
        lookupKey: key,
      });
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleImageSelect = (file) => {
    if (!file?.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image too large. Please use an image under 5MB.');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleImageSelect(file);
  };

  const startReview = ({ productName, brand, imageUrl, ingredientsText, notes, readable, source, lookupKey, offIngredients, nutrientsInfo }) => {
    setReview({ notes: notes || '', readable: readable !== false, source, lookupKey, brand: brand || null, imageUrl: imageUrl || null, offIngredients: offIngredients || null, nutrientsInfo: nutrientsInfo || null });
    setReviewProductName(productName && productName !== 'Unknown Product' ? productName : '');
    setReviewText(ingredientsText || '');
  };

  const handleAnalyze = async (scannedCode) => {
    setError('');

    // A camera scan calls this straight after setBarcodeInput(), whose
    // state update hasn't landed yet on this render -- passing the
    // scanned value through directly avoids reading stale state.
    const barcodeValue = (scannedCode ?? barcodeInput).trim();

    if (mode === 'text' && !text.trim()) {
      setError('Please paste or type the ingredients list.');
      return;
    }
    if (mode === 'image' && !imageFile) {
      setError('Please upload a photo of the food label.');
      return;
    }
    if (mode === 'barcode' && !barcodeValue) {
      setError('Please enter the barcode number (usually below the barcode lines).');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'text') {
        const key = textKey(text.trim());
        setLoadingMessage('Checking cache...');
        let result = await getCachedReport(key);

        if (!result) {
          setLoadingMessage('Looking up ingredients...');
          const analysis = await analyzeText(text.trim(), textProductName.trim());
          result = analysis.report;
          result.ingredientsText = text.trim();

          // A single-ingredient search (e.g. "INS 102") isn't a real
          // product — it's already cached in the ingredients table, so
          // saving it again here as a "product" would just be redundant.
          if (!analysis.isIngredientOnly) {
            saveReport({
              lookupKey: key,
              source: 'text',
              productName: textProductName.trim() || result.productName,
              ingredientsText: text.trim(),
              report: result,
            });
          }
        }
        if (textProductName.trim()) result.productName = textProductName.trim();
        result.lookupKey = key;
        const id = saveToHistory(result, mode);
        if (shoppingMode) {
          addToShoppingSession(result, id);
          resetForNextScan();
          setLoading(false);
          return;
        }
        navigate(`/result/${id}`);
        return;
      }

      if (mode === 'image') {
        setLoadingMessage('Reading your food label...');
        const extracted = await extractIngredientsFromImage(imageFile);
        if (!extracted.readable && !extracted.ingredientsText) {
          setError(extracted.notes || "Couldn't read this photo clearly. Try a clearer, closer photo, or paste the ingredients instead.");
          setLoading(false);
          return;
        }
        startReview({ ...extracted, source: 'image' });
        setLoading(false);
        return;
      }

      if (mode === 'barcode') {
        const key = barcodeKey(barcodeValue);
        setLoadingMessage('Checking cache...');
        const cached = await getCachedReport(key);
        if (cached) {
          cached.lookupKey = key;
          const id = saveToHistory(cached, mode);
          if (shoppingMode) {
            addToShoppingSession(cached, id);
            resetForNextScan();
            setLoading(false);
            return;
          }
          navigate(`/result/${id}`);
          return;
        }

        setLoadingMessage('Looking up product...');
        const found = await lookupBarcode(barcodeValue);
        if (!found.found) {
          setError("This product isn't in the product database yet. Try pasting the ingredients or uploading a photo instead.");
          setNotFoundBarcode(barcodeValue);
          setLoading(false);
          return;
        }
        startReview({ ...found, source: 'barcode', lookupKey: key });
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleBarcodeDetected = (code) => {
    setShowScanner(false);
    setBarcodeInput(code);
    handleAnalyze(code);
  };

  const handleConfirmReview = async () => {
    if (!reviewText.trim()) {
      setError('Ingredients list is empty. Please add at least one ingredient.');
      return;
    }
    setError('');
    setLoading(true);

    // Barcode-sourced reviews already had their exact key checked (and
    // missed) before we ever got here — only text/photo-sourced reviews
    // need a fresh cache check, keyed off the final, user-confirmed text.
    const key = review.source === 'barcode' ? review.lookupKey : textKey(reviewText.trim());

    try {
      let result = null;
      if (review.source !== 'barcode') {
        setLoadingMessage('Checking cache...');
        result = await getCachedReport(key);
      }

      if (!result) {
        setLoadingMessage('Looking up ingredients...');
        const analysis = await analyzeText(reviewText.trim(), reviewProductName.trim(), review.brand, review.offIngredients, review.imageUrl, review.nutrientsInfo);
        result = analysis.report;
        result.ingredientsText = reviewText.trim();

        // Same rule as text mode: a single-ingredient result isn't a
        // real product, so don't cache it as one.
        if (!analysis.isIngredientOnly) {
          saveReport({
            lookupKey: key,
            source: review.source,
            productName: reviewProductName.trim() || result.productName,
            ingredientsText: reviewText.trim(),
            report: result,
          });
        }
      }

      if (reviewProductName.trim()) result.productName = reviewProductName.trim();
      result.lookupKey = key;

      const id = saveToHistory(result, mode);
      if (shoppingMode) {
        addToShoppingSession(result, id);
        resetForNextScan();
        setLoading(false);
        return;
      }
      navigate(`/result/${id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const cancelReview = () => {
    setReview(null);
    setReviewText('');
    setReviewProductName('');
    setError('');
  };

  // The running session list -- shared across the search view, the
  // active scan forms (text/image/barcode) and the review screen, so
  // it stays visible for the whole "scan, quick result, ready for the
  // next one" loop instead of only on the home screen. resetForNextScan
  // deliberately keeps `mode` on the same scan method between items, so
  // this can't live inside a mode === 'search' block.
  const shoppingSessionPanel = shoppingMode && shoppingSession.length > 0 && (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Shopping Session ({shoppingSession.length})
        </p>
        <button onClick={clearShoppingSession} className="tap-scale text-xs font-semibold text-red-400 hover:text-red-600 transition-colors">
          Clear
        </button>
      </div>
      <div className="space-y-2 mb-3">
        {shoppingSession.map((item) => {
          const r = item.report;
          const colors = typeof r.overallScore === 'number' ? getScoreColor(r.overallScore) : null;
          return (
            <div
              key={item.historyId}
              className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2"
            >
              <ProductImage src={r.imageUrl} size={40} expandable={false} />
              <button
                onClick={() => navigate(`/result/${item.historyId}`)}
                className="tap-scale flex-1 min-w-0 text-left text-sm text-slate-700 dark:text-slate-200 truncate"
              >
                {r.productName || 'Unknown Product'}
              </button>
              {r.isInfantFormula ? (
                <span
                  className="flex-shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5"
                  style={{ background: 'var(--v-moderate-bg)', color: 'var(--v-moderate)' }}
                >
                  Specialized
                </span>
              ) : (
                colors && (
                  <span
                    className="flex-shrink-0 text-xs font-bold rounded-full px-2 py-0.5"
                    style={{ background: colors.bg, color: colors.color }}
                  >
                    {r.overallScore}/100
                  </span>
                )
              )}
              <button
                onClick={() => removeFromShoppingSession(item.historyId)}
                aria-label="Remove"
                className="tap-scale flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-700 transition-colors"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {shoppingSession.length >= 2 && (
        <button
          onClick={() => navigate('/compare/result', { state: { products: shoppingSession.map((s) => s.report) } })}
          className="tap-scale w-full py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors"
        >
          ⚖️ Compare selected ({shoppingSession.length})
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 pb-24">
        <LoadingScreen message={loadingMessage} />
      </div>
    );
  }

  // Review screen — shown after a photo is read or a barcode is found,
  // so the user can fix anything the scan missed before we analyze it.
  if (review) {
    return (
      <div className="page-in max-w-2xl mx-auto px-4 py-8 pb-24">
        <button
          onClick={cancelReview}
          className="tap-scale inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 mb-4 transition-colors"
        >
          ← Start over
        </button>

        {shoppingSessionPanel}

        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">Check before we analyze</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {mode === 'image'
            ? "Small print is easy to misread — please check this matches the pack before we generate your report."
            : 'This came from an open product database — please check it looks right.'}
        </p>

        {(!review.readable || review.notes) && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <span>⚠️</span>
            <span>{review.notes || 'The photo may not have captured the full ingredients list clearly — please double-check and complete it below.'}</span>
          </div>
        )}

        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Product name (optional)
        </label>
        <input
          type="text"
          value={reviewProductName}
          onChange={(e) => setReviewProductName(e.target.value)}
          placeholder="e.g. Maggi 2-Minute Noodles"
          className="w-full mb-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />

        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Ingredients list — edit or complete anything that's missing:
        </label>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          className="w-full h-44 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleConfirmReview}
          className="tap-scale w-full mt-4 py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-base rounded-xl transition-colors shadow-md shadow-green-200"
        >
          ✅ Looks good — Analyze
        </button>
      </div>
    );
  }

  return (
    <div className="page-in max-w-2xl mx-auto px-4 pb-24">

      {mode === 'search' && (
        <>
          {/* Hero band -- one headline and one quiet stats line. The old
              version stacked a headline, a decorative badge and two boxed
              stat pills into a short band, and the search bar then
              overlapped all of it; less in the band reads calmer. */}
          <div className="hero-animated relative -mx-4 px-5 pt-5 pb-10 rounded-b-[28px] overflow-hidden">
            <h1 className="relative text-white text-[26px] leading-[1.15] font-extrabold tracking-tight">
              Know what's <span className="text-lime-300">in</span><br />your food.
            </h1>
            {sectionsLoading ? (
              <div className="relative shimmer-light h-4 w-48 rounded-full mt-3" />
            ) : stats && (
              <p className="relative mt-2.5 flex items-center gap-2 text-[13px] text-white/85">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-300 flex-shrink-0" aria-hidden="true" />
                <span><span className="font-bold text-white">{stats.total.toLocaleString()}</span> foods checked</span>
                <span className="text-white/40" aria-hidden="true">·</span>
                <span><span className="font-bold text-white">+{stats.addedToday.toLocaleString()}</span> today</span>
              </p>
            )}
          </div>

          {/* Search bar */}
          <div className="-mt-6 mb-4 relative z-10">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200 border border-slate-100 dark:border-slate-800 px-4 py-3">
              <span className="text-slate-400 dark:text-slate-500 text-lg flex-shrink-0">🔍</span>
              <div className="flex-1 min-w-0">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search a product"
                  autoComplete="off"
                  className="w-full text-[15px] font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-800 dark:placeholder:text-slate-300 bg-transparent focus:outline-none"
                />
                {searchQuery.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 -mt-0.5">Maggi, Parle-G, Oreo...</p>
                )}
              </div>
              <button
                onClick={() => searchInputRef.current?.focus()}
                aria-label="Search"
                className="tap-scale w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white text-base flex-shrink-0"
              >
                🔍
              </button>
            </div>
          </div>

          {/* Quick actions -- Photo is the primary/most common flow, so it
              gets the bigger green pill; Barcode/Paste are secondary,
              smaller, and share the row instead of each getting a full
              card -- keeps Popular searches/Explore food within reach
              without scrolling. */}
          {searchQuery.trim().length === 0 && (
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => { setMode('image'); setError(''); }}
                className="tap-scale flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-200 transition-colors"
              >
                <span className="text-base">📷</span>
                <span className="text-sm font-bold">Scan Photo</span>
              </button>
              <button
                onClick={() => { setMode('barcode'); setError(''); }}
                className="tap-scale flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              >
                <BarcodeIcon />
                <span className="text-xs font-semibold">Barcode</span>
              </button>
              <button
                onClick={() => { setMode('text'); setError(''); }}
                className="tap-scale flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              >
                <span className="text-sm">📄</span>
                <span className="text-xs font-semibold">Paste</span>
              </button>
            </div>
          )}

          {/* Shopping Mode -- "scan, quick result, ready for the next
              one" instead of scan -> full Result page -> back -> scan
              again. The toggle just flips how the SAME scan flow above
              ends (see resetForNextScan/addToShoppingSession): normally
              it navigates to /result/:id, in Shopping Mode it adds to
              the running list below and resets for another scan. */}
          {searchQuery.trim().length === 0 && (
            <div className="mb-5">
              <button
                onClick={() => setShoppingMode((v) => !v)}
                className={`tap-scale w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border transition-colors ${
                  shoppingMode
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="text-sm font-bold">🛒 Shopping Mode</span>
                <span className="text-xs font-semibold">{shoppingMode ? 'ON — tap to end' : 'OFF — tap to start'}</span>
              </button>
              {shoppingMode && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  Every scan adds to your list below and gets you ready for the next one straight away.
                </p>
              )}
            </div>
          )}

          {searchQuery.trim().length === 0 && shoppingSessionPanel}

          {/* Personal FoodGuard -- pick who you're checking food for
              BEFORE scanning, instead of only after landing on the
              Result page. Just remembers the choice (setActiveProfile);
              it deliberately shows no per-profile score here, since
              there's no scanned product yet to score against. */}
          {searchQuery.trim().length === 0 && profiles.length > 0 && (
            <div className="mb-5">
              <div className="flex items-start justify-between gap-2 mb-2 px-0.5">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Who are you checking food for?</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">FoodGuard can personalize the result to each family member.</p>
                </div>
                <button
                  onClick={() => navigate('/family')}
                  className="tap-scale text-xs font-semibold text-green-600 dark:text-green-400 flex-shrink-0 pt-0.5"
                >
                  Manage family
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {profiles.map((p) => {
                  const active = p.id === activeProfileId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActiveProfile(active ? null : p.id)}
                      className={`tap-scale flex-shrink-0 flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-green-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                          active ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-700'
                        }`}
                      >
                        {p.avatarEmoji}
                      </span>
                      {p.nickname}
                    </button>
                  );
                })}
                <button
                  onClick={() => navigate('/family')}
                  className="tap-scale flex-shrink-0 flex items-center px-3 py-2 rounded-full text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-green-600 dark:text-green-400"
                >
                  + Add person
                </button>
              </div>
            </div>
          )}

          {/* Today's picks -- one high scorer, one low scorer, both real
              and rotating daily. "FoodGuard pick" (not "Healthiest
              pick") avoids implying there's one absolute winner when the
              score is a contextual ingredient/nutrition assessment, not
              a medical verdict -- same reasoning as the hero line above.
              Each card shows its score badge plus up to 2 of the actual
              reasons behind it (report.positives / report.flags,
              already computed by scoringEngine.js), so the homepage
              teaches by example instead of asserting "worth a closer
              look" with nothing to back it up. */}
          {searchQuery.trim().length === 0 && sectionsLoading && (
            <div className="mb-6">
              <SkeletonBlock className="h-4 w-40 mb-2 ml-0.5" />
              <div className="grid grid-cols-2 gap-2.5">
                <SkeletonBlock className="h-24" />
                <SkeletonBlock className="h-24" />
              </div>
            </div>
          )}

          {searchQuery.trim().length === 0 && !sectionsLoading && (spotlight.best || spotlight.worst) && (
            <div className="mb-6">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 px-0.5">Today's FoodGuard picks</p>
              <div className="grid grid-cols-2 gap-2.5">
                {spotlight.best && (
                  <button
                    onClick={() => openCachedSuggestion(spotlight.best)}
                    className="tap-scale flex flex-col gap-1.5 p-3 rounded-2xl bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-900 text-left"
                  >
                    <span className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">FoodGuard pick</span>
                    <div className="flex items-center gap-2.5">
                      <ProductImage src={spotlight.best.imageUrl} size={44} expandable={false} />
                      <span className="block min-w-0 flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">{spotlight.best.productName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="flex-shrink-0 text-[10.5px] font-bold rounded-full px-1.5 py-0.5"
                        style={{ background: getScoreColor(spotlight.best.score).bg, color: getScoreColor(spotlight.best.score).color }}
                      >
                        {spotlight.best.score}/100
                      </span>
                      {spotlight.best.reasons[0] && (
                        <span className="text-[10.5px] text-green-700 dark:text-green-400 leading-tight line-clamp-1 min-w-0">✓ {spotlight.best.reasons[0]}</span>
                      )}
                    </div>
                  </button>
                )}
                {spotlight.worst && (
                  <button
                    onClick={() => openCachedSuggestion(spotlight.worst)}
                    className="tap-scale flex flex-col gap-1.5 p-3 rounded-2xl bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-left"
                  >
                    <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">Worth a closer look</span>
                    <div className="flex items-center gap-2.5">
                      <ProductImage src={spotlight.worst.imageUrl} size={44} expandable={false} />
                      <span className="block min-w-0 flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">{spotlight.worst.productName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="flex-shrink-0 text-[10.5px] font-bold rounded-full px-1.5 py-0.5"
                        style={{ background: getScoreColor(spotlight.worst.score).bg, color: getScoreColor(spotlight.worst.score).color }}
                      >
                        {spotlight.worst.score}/100
                      </span>
                      {spotlight.worst.reasons[0] && (
                        <span className="text-[10.5px] text-red-700 dark:text-red-400 leading-tight line-clamp-1 min-w-0">⚠ {spotlight.worst.reasons[0]}</span>
                      )}
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Popular searches -- real scan-count data, not a guess. */}
          {searchQuery.trim().length === 0 && sectionsLoading && (
            <div className="mb-6">
              <SkeletonBlock className="h-4 w-32 mb-2 ml-0.5" />
              <div className="flex gap-2">
                <SkeletonBlock className="h-9 w-20 rounded-full" />
                <SkeletonBlock className="h-9 w-24 rounded-full" />
                <SkeletonBlock className="h-9 w-16 rounded-full" />
              </div>
            </div>
          )}
          {searchQuery.trim().length === 0 && !sectionsLoading && popularTerms.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 px-0.5">Popular searches</p>
              <div className="relative">
                <div className="flex gap-2 overflow-x-auto pb-1 pr-8" style={{ scrollbarWidth: 'none' }}>
                  {popularTerms.map((term, i) => (
                    <button
                      key={term}
                      onClick={() => setSearchQuery(term)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className="item-in tap-scale flex-shrink-0 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
                {/* Fade hints there's more to scroll to -- the row has no
                    other visual cue that it doesn't just end there. */}
                <div
                  className="pointer-events-none absolute top-0 right-0 bottom-1 w-10"
                  style={{ background: 'linear-gradient(to right, transparent, var(--bg-grouped))' }}
                />
              </div>
            </div>
          )}

          {/* Recently analyzed -- the newest products in the catalog, so
              the app has something fresh to show even to someone who
              never types a search. Named for what actually happened to
              these products (FoodGuard analyzed them), not "added" --
              which reads ambiguously as "added by whom, to what". */}
          {searchQuery.trim().length === 0 && sectionsLoading && (
            <div className="mb-6">
              <SkeletonBlock className="h-4 w-36 mb-2 ml-0.5" />
              <div className="flex gap-3">
                <SkeletonBlock className="h-28 w-24 flex-shrink-0" />
                <SkeletonBlock className="h-28 w-24 flex-shrink-0" />
                <SkeletonBlock className="h-28 w-24 flex-shrink-0" />
              </div>
            </div>
          )}
          {searchQuery.trim().length === 0 && !sectionsLoading && recentlyAdded.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 px-0.5">Recently analyzed</p>
              <div className="relative">
                <div className="flex gap-3 overflow-x-auto pb-1 pr-8" style={{ scrollbarWidth: 'none' }}>
                  {recentlyAdded.map((item, i) => (
                    <ProductStripCard
                      key={item.lookupKey}
                      item={item}
                      onClick={() => openCachedSuggestion(item)}
                      style={{ animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
                <div
                  className="pointer-events-none absolute top-0 right-0 bottom-1 w-10"
                  style={{ background: 'linear-gradient(to right, transparent, var(--bg-grouped))' }}
                />
              </div>
            </div>
          )}

          {/* Explore food -- every category in one horizontal row, so there is
              no separate "all categories" page to go find. Waits for the
              same load gate as the sections above so nothing appears
              ahead of the rest. */}
          {searchQuery.trim().length === 0 && sectionsLoading && (
            <div className="mb-6">
              <SkeletonBlock className="h-4 w-28 mb-2 ml-0.5" />
              <div className="flex gap-3">
                {[0, 1, 2, 3, 4].map((n) => <SkeletonBlock key={n} className="h-[88px] w-[72px] flex-shrink-0" />)}
              </div>
            </div>
          )}
          {searchQuery.trim().length === 0 && !sectionsLoading && (
            <div className="mb-6">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 px-0.5">Explore food</p>
              <div className="relative">
                <div className="flex gap-3 overflow-x-auto pb-1 pr-8" style={{ scrollbarWidth: 'none' }}>
                  {CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.id}
                      onClick={() => navigate(`/category/${cat.id}`)}
                      style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
                      className="item-in tap-scale flex-shrink-0 w-[72px] flex flex-col items-center gap-1"
                    >
                      <img
                        src={cat.image}
                        alt=""
                        loading="lazy"
                        className="w-[72px] h-[72px] object-cover rounded-2xl shadow-sm"
                      />
                      <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 text-center leading-tight line-clamp-2 w-full">
                        {cat.label}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  className="pointer-events-none absolute top-0 right-0 bottom-1 w-10"
                  style={{ background: 'linear-gradient(to right, transparent, var(--bg-grouped))' }}
                />
              </div>
            </div>
          )}

          {/* Did you know -- prefers today's AI-generated fact
              (dailyFact, from scripts/generate-daily-fact.js) when
              one exists, falling back to the static curated rotation
              (todaysTip) otherwise. Only the AI-generated one gets a
              "Learn more" button -- the static tips have no separate
              detail text to expand into, and a button that opens
              nothing would be worse than no button. */}
          {searchQuery.trim().length === 0 && sectionsLoading && <SkeletonBlock className="h-16 mb-6" />}
          {searchQuery.trim().length === 0 && !sectionsLoading && (
            <div className="item-in mb-6 flex gap-3 items-start p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
              <span className="text-lg flex-shrink-0">💡</span>
              <div className="min-w-0">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <span className="font-bold text-slate-800 dark:text-slate-100">Did you know? </span>
                  {dailyFact ? dailyFact.shortFact : todaysTip}
                </p>
                {dailyFact && (
                  <button
                    onClick={() => setShowFactDetail(true)}
                    className="tap-scale text-xs font-semibold text-green-600 dark:text-green-400 mt-1"
                  >
                    Learn more
                  </button>
                )}
              </div>
            </div>
          )}

          {showFactDetail && dailyFact && createPortal(
            <div
              className="fixed inset-0 z-[999] bg-black/50 flex items-end sm:items-center justify-center"
              onClick={() => setShowFactDetail(false)}
            >
              <div
                className="relative w-full sm:max-w-[480px] max-h-[85vh] overflow-y-auto rounded-t-[24px] sm:rounded-[20px] p-5 bg-white dark:bg-slate-800"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowFactDetail(false)}
                  aria-label="Close"
                  className="tap-scale absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                >
                  ×
                </button>
                <p className="text-[13px] font-bold text-green-600 dark:text-green-400 pr-8 mb-2">💡 Did you know?</p>
                <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 leading-relaxed mb-3">
                  {dailyFact.shortFact}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {dailyFact.detail}
                </p>
              </div>
            </div>,
            document.body
          )}

          {searching && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 px-1">Searching…</p>
          )}

          {!searching && searchError && suggestions.cached.length === 0 && suggestions.off.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 px-1">{searchError}</p>
          )}

          {!searching && !searchError && searchQuery.trim().length >= 2 &&
            suggestions.cached.length === 0 && suggestions.off.length === 0 && (
            <div className="mt-2 mx-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Can't find "{searchQuery.trim()}"? Scan the label and FoodGuard will analyze and add it.
              </p>
              <button
                onClick={() => { setMode('image'); setError(''); setSearchQuery(''); }}
                className="tap-scale w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
              >
                📷 Scan label
              </button>
            </div>
          )}

          {(suggestions.cached.length > 0 || suggestions.off.length > 0) && (
            <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800">
              {suggestions.cached.map((item, i) => (
                <button
                  key={item.lookupKey}
                  onClick={() => openCachedSuggestion(item)}
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                  className="item-in tap-scale w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    {item.brand && (
                      <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        {item.brand}
                      </span>
                    )}
                    <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{item.productName}</span>
                  </span>
                  {typeof item.score === 'number' && (
                    <span
                      className="flex-shrink-0 text-xs font-bold rounded-full px-2 py-0.5"
                      style={{ background: getScoreColor(item.score).bg, color: getScoreColor(item.score).color }}
                    >
                      {item.score}/100
                    </span>
                  )}
                </button>
              ))}

              {suggestions.off.map((item, i) => (
                <button
                  key={item.code}
                  onClick={() => openSearchResult(item)}
                  style={{ animationDelay: `${Math.min((suggestions.cached.length + i) * 30, 300)}ms` }}
                  className="item-in tap-scale w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {item.brand && (
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      {item.brand}
                    </span>
                  )}
                  <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{item.productName}</span>
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 text-center">
            Powered by a free open product database · already-scored items load instantly
          </p>
        </>
      )}

      {/* Back link -- Photo/Barcode/Paste replace the search view entirely,
          so they need their own way back to it now that there's no tab bar. */}
      {mode !== 'search' && (
        <button
          onClick={() => { setMode('search'); setError(''); }}
          className="tap-scale inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 pt-5 pb-2 transition-colors"
        >
          ← Back to search
        </button>
      )}

      {mode !== 'search' && shoppingSessionPanel}

      {/* Text Mode */}
      {mode === 'text' && (
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Product name (optional, but helps identify it correctly)
          </label>
          <input
            type="text"
            value={textProductName}
            onChange={(e) => setTextProductName(e.target.value)}
            placeholder="e.g. Parle-G Biscuits"
            className="w-full mb-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />

          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Paste the ingredients list from the back of the pack:
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Example:\nWheat flour, Sugar, Palm oil, Skimmed milk powder, Cocoa powder, Salt, Raising agents (INS 500ii, INS 503ii), Emulsifier (INS 322), Artificial flavour (Vanilla)`}
            className="w-full h-44 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Tip: The ingredient list is usually on the back of the packet in small text.
          </p>
        </div>
      )}

      {/* Image Mode */}
      {mode === 'image' && (
        <div className="mb-4">
          <div
            className={`upload-area rounded-xl p-8 text-center cursor-pointer ${dragOver ? 'drag-over' : ''} ${imagePreview ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {imagePreview ? (
              <div>
                <img
                  src={imagePreview}
                  alt="Selected label"
                  className="max-h-48 mx-auto rounded-lg object-contain mb-3"
                />
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">✅ Photo selected — tap Analyze to continue</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Click to change photo</p>
              </div>
            ) : (
              <div>
                <div className="text-5xl mb-3">📸</div>
                <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Drop your food label photo here</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">or click to choose from your device</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">JPG, PNG, WEBP · Max 5MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageSelect(e.target.files[0])}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            💡 Tip: get close, use good light, and if the list wraps around the pack, fit as much as you can in one shot — you'll get to check and complete it before we analyze.
          </p>
        </div>
      )}

      {/* Barcode Mode */}
      {mode === 'barcode' && (
        <div className="mb-4">
          {isBarcodeScanSupported() && (
            <button
              onClick={() => setShowScanner(true)}
              className="tap-scale w-full mb-3 py-3.5 rounded-xl border-2 border-dashed border-green-300 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 font-semibold text-sm flex items-center justify-center gap-2"
            >
              📷 Scan with camera
            </button>
          )}
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Or enter the barcode number:
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={barcodeInput}
            onChange={(e) => { setBarcodeInput(e.target.value.replace(/[^0-9]/g, '')); setNotFoundBarcode(''); }}
            placeholder="e.g. 8901058851468"
            className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-widest"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            The number printed below the barcode lines on the pack. We check it against a free open product database — if it's not listed, you can still paste ingredients or take a photo.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Not-found CTA -- offer to submit the product instead of a dead
          end, right under the error explaining why the lookup failed. */}
      {mode === 'barcode' && notFoundBarcode && (
        <button
          onClick={() => navigate(`/submit-product?barcode=${notFoundBarcode}`)}
          className="tap-scale w-full mb-4 py-3 rounded-xl border-2 border-dashed border-green-300 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 font-semibold text-sm flex items-center justify-center gap-2"
        >
          📷 Submit this product to FoodGuard
        </button>
      )}

      {/* Analyze Button — search mode acts on picking a result instead */}
      {mode !== 'search' && (
        <button
          onClick={() => handleAnalyze()}
          disabled={loading}
          className="tap-scale w-full py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-base rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-200"
        >
          {mode === 'barcode' ? '🔍 Look Up Product' : '🔍 Analyze Ingredients'}
        </button>
      )}

      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}

    </div>
  );
}
