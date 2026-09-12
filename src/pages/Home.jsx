// src/pages/Home.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { extractIngredientsFromImage } from '../services/geminiService';
import { analyzeText } from '../services/analyzeText';
import { lookupBarcode, searchProductsByName } from '../services/openFoodFacts';
import { getCachedReport, saveReport, barcodeKey, textKey, searchCachedProducts, getPopularSearchTerms } from '../services/productCache';
import { saveToHistory } from '../utils/storage';
import LoadingScreen from '../components/LoadingScreen';
import CategoryIcon from '../components/CategoryIcon';
import { CATEGORIES } from '../data/categories';

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
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [suggestions, setSuggestions] = useState({ cached: [], off: [] });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [popularTerms, setPopularTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analyzing ingredients...');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const navigate = useNavigate();

  // Real usage data for the "Popular searches" pills -- loaded once, not
  // worth the type-ahead effect's debounce/cancellation machinery.
  useEffect(() => {
    getPopularSearchTerms(8).then(setPopularTerms);
  }, []);

  // Review step: set after an image is read or a barcode is looked up,
  // so the user can check/fix the ingredients text before we analyze it.
  const [review, setReview] = useState(null); // { productName, ingredientsText, notes, readable }
  const [reviewText, setReviewText] = useState('');
  const [reviewProductName, setReviewProductName] = useState('');

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

  const startReview = ({ productName, brand, imageUrl, ingredientsText, notes, readable, source, lookupKey, offIngredients }) => {
    setReview({ notes: notes || '', readable: readable !== false, source, lookupKey, brand: brand || null, imageUrl: imageUrl || null, offIngredients: offIngredients || null });
    setReviewProductName(productName && productName !== 'Unknown Product' ? productName : '');
    setReviewText(ingredientsText || '');
  };

  const handleAnalyze = async () => {
    setError('');

    if (mode === 'text' && !text.trim()) {
      setError('Please paste or type the ingredients list.');
      return;
    }
    if (mode === 'image' && !imageFile) {
      setError('Please upload a photo of the food label.');
      return;
    }
    if (mode === 'barcode' && !barcodeInput.trim()) {
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
        const key = barcodeKey(barcodeInput.trim());
        setLoadingMessage('Checking cache...');
        const cached = await getCachedReport(key);
        if (cached) {
          cached.lookupKey = key;
          const id = saveToHistory(cached, mode);
          navigate(`/result/${id}`);
          return;
        }

        setLoadingMessage('Looking up product...');
        const found = await lookupBarcode(barcodeInput.trim());
        if (!found.found) {
          setError("This product isn't in the product database yet. Try pasting the ingredients or uploading a photo instead.");
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
        const analysis = await analyzeText(reviewText.trim(), reviewProductName.trim(), review.brand, review.offIngredients, review.imageUrl);
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
          className="tap-scale flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
        >
          ← Start over
        </button>

        <h1 className="text-xl font-bold text-slate-800 mb-1">Check before we analyze</h1>
        <p className="text-sm text-slate-500 mb-4">
          {mode === 'image'
            ? "Small print is easy to misread — please check this matches the pack before we generate your report."
            : 'This came from an open product database — please check it looks right.'}
        </p>

        {(!review.readable || review.notes) && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-start gap-2">
            <span>⚠️</span>
            <span>{review.notes || 'The photo may not have captured the full ingredients list clearly — please double-check and complete it below.'}</span>
          </div>
        )}

        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Product name (optional)
        </label>
        <input
          type="text"
          value={reviewProductName}
          onChange={(e) => setReviewProductName(e.target.value)}
          placeholder="e.g. Maggi 2-Minute Noodles"
          className="w-full mb-4 p-3 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400"
        />

        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Ingredients list — edit or complete anything that's missing:
        </label>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          className="w-full h-44 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-start gap-2">
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
          {/* Hero band */}
          <div className="-mx-4 px-4 pt-6 pb-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-b-[28px]">
            <h1 className="text-white text-[17px] font-bold text-center opacity-95">
              Is your food actually safe?
            </h1>
          </div>

          {/* Search bar */}
          <div className="-mt-5 mb-4 relative z-10">
            <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg shadow-slate-200 border border-slate-100 px-4 py-3">
              <span className="text-slate-400 text-lg flex-shrink-0">🔍</span>
              <div className="flex-1 min-w-0">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search a product"
                  autoComplete="off"
                  className="w-full text-[15px] font-semibold text-slate-800 placeholder:text-slate-800 bg-transparent focus:outline-none"
                />
                {searchQuery.length === 0 && (
                  <p className="text-xs text-slate-400 -mt-0.5">Maggi, Parle-G, Oreo...</p>
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
                className="tap-scale flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              >
                <BarcodeIcon />
                <span className="text-xs font-semibold">Barcode</span>
              </button>
              <button
                onClick={() => { setMode('text'); setError(''); }}
                className="tap-scale flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              >
                <span className="text-sm">📄</span>
                <span className="text-xs font-semibold">Paste</span>
              </button>
            </div>
          )}

          {/* Popular searches -- real scan-count data, not a guess. */}
          {searchQuery.trim().length === 0 && popularTerms.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <p className="text-sm font-bold text-slate-800">Popular searches</p>
                <button onClick={() => navigate('/popular')} className="tap-scale text-xs font-semibold text-green-600">
                  See all
                </button>
              </div>
              <div className="relative">
                <div className="flex gap-2 overflow-x-auto pb-1 pr-8" style={{ scrollbarWidth: 'none' }}>
                  {popularTerms.map((term, i) => (
                    <button
                      key={term}
                      onClick={() => setSearchQuery(term)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className="item-in tap-scale flex-shrink-0 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 transition-colors"
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

          {/* Browse by category -- shown while the search box is empty, so
              there's something to explore before typing anything. */}
          {searchQuery.trim().length === 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <p className="text-sm font-bold text-slate-800">Explore food</p>
                <button onClick={() => navigate('/browse')} className="tap-scale text-xs font-semibold text-green-600">
                  See all
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.id}
                    onClick={() => navigate(`/category/${cat.id}`)}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className={`item-in tap-scale flex flex-col items-center gap-2 py-3.5 px-1 rounded-2xl transition-transform hover:-translate-y-0.5 text-center ${cat.bg}`}
                  >
                    <span
                      className={`rounded-full flex items-center justify-center flex-shrink-0 ${cat.iconBg} ${cat.iconColor}`}
                      style={{ width: 50, height: 50 }}
                    >
                      <CategoryIcon id={cat.id} className="w-7 h-7" />
                    </span>
                    <span className="text-[15px] font-semibold text-slate-700 leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searching && (
            <p className="text-xs text-slate-400 mt-2 px-1">Searching…</p>
          )}

          {!searching && searchError && suggestions.cached.length === 0 && suggestions.off.length === 0 && (
            <p className="text-xs text-amber-600 mt-2 px-1">{searchError}</p>
          )}

          {!searching && !searchError && searchQuery.trim().length >= 2 &&
            suggestions.cached.length === 0 && suggestions.off.length === 0 && (
            <p className="text-xs text-slate-400 mt-2 px-1">
              No products found with a readable ingredients list. Try a different spelling, or use Paste / Photo to enter the ingredients yourself.
            </p>
          )}

          {(suggestions.cached.length > 0 || suggestions.off.length > 0) && (
            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
              {suggestions.cached.map((item, i) => (
                <button
                  key={item.lookupKey}
                  onClick={() => openCachedSuggestion(item)}
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                  className="item-in tap-scale w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    {item.brand && (
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {item.brand}
                      </span>
                    )}
                    <span className="block text-sm text-slate-700 truncate">{item.productName}</span>
                  </span>
                  {typeof item.score === 'number' && (
                    <span className="flex-shrink-0 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
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
                  className="item-in tap-scale w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  {item.brand && (
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {item.brand}
                    </span>
                  )}
                  <span className="block text-sm text-slate-700 truncate">{item.productName}</span>
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-3 text-center">
            Powered by a free open product database · already-scored items load instantly
          </p>
        </>
      )}

      {/* Back link -- Photo/Barcode/Paste replace the search view entirely,
          so they need their own way back to it now that there's no tab bar. */}
      {mode !== 'search' && (
        <button
          onClick={() => { setMode('search'); setError(''); }}
          className="tap-scale flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 pt-5 pb-2 transition-colors"
        >
          ← Back to search
        </button>
      )}

      {/* Text Mode */}
      {mode === 'text' && (
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Product name (optional, but helps identify it correctly)
          </label>
          <input
            type="text"
            value={textProductName}
            onChange={(e) => setTextProductName(e.target.value)}
            placeholder="e.g. Parle-G Biscuits"
            className="w-full mb-4 p-3 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400"
          />

          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Paste the ingredients list from the back of the pack:
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Example:\nWheat flour, Sugar, Palm oil, Skimmed milk powder, Cocoa powder, Salt, Raising agents (INS 500ii, INS 503ii), Emulsifier (INS 322), Artificial flavour (Vanilla)`}
            className="w-full h-44 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400"
          />
          <p className="text-xs text-slate-400 mt-1">
            Tip: The ingredient list is usually on the back of the packet in small text.
          </p>
        </div>
      )}

      {/* Image Mode */}
      {mode === 'image' && (
        <div className="mb-4">
          <div
            className={`upload-area rounded-xl p-8 text-center cursor-pointer ${dragOver ? 'drag-over' : ''} ${imagePreview ? 'border-green-400 bg-green-50' : ''}`}
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
                <p className="text-sm text-green-600 font-medium">✅ Photo selected — tap Analyze to continue</p>
                <p className="text-xs text-slate-400 mt-1">Click to change photo</p>
              </div>
            ) : (
              <div>
                <div className="text-5xl mb-3">📸</div>
                <p className="font-semibold text-slate-700 mb-1">Drop your food label photo here</p>
                <p className="text-sm text-slate-400">or click to choose from your device</p>
                <p className="text-xs text-slate-400 mt-2">JPG, PNG, WEBP · Max 5MB</p>
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
          <p className="text-xs text-slate-400 mt-2">
            💡 Tip: get close, use good light, and if the list wraps around the pack, fit as much as you can in one shot — you'll get to check and complete it before we analyze.
          </p>
        </div>
      )}

      {/* Barcode Mode */}
      {mode === 'barcode' && (
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Enter the barcode number:
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 8901058851468"
            className="w-full p-4 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-400 tracking-widest"
          />
          <p className="text-xs text-slate-400 mt-1">
            The number printed below the barcode lines on the pack. We check it against a free open product database — if it's not listed, you can still paste ingredients or take a photo.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-start gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Analyze Button — search mode acts on picking a result instead */}
      {mode !== 'search' && (
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="tap-scale w-full py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-base rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-200"
        >
          {mode === 'barcode' ? '🔍 Look Up Product' : '🔍 Analyze Ingredients'}
        </button>
      )}

    </div>
  );
}
