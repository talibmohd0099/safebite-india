// src/pages/Home.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractIngredientsFromImage } from '../services/geminiService';
import { analyzeText } from '../services/analyzeText';
import { lookupBarcode } from '../services/openFoodFacts';
import { getCachedReport, saveReport, barcodeKey, textKey } from '../services/productCache';
import { saveToHistory } from '../utils/storage';
import LoadingScreen from '../components/LoadingScreen';

export default function Home() {
  const [mode, setMode] = useState('text'); // 'text' | 'image' | 'barcode'
  const [text, setText] = useState('');
  const [textProductName, setTextProductName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analyzing ingredients...');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Review step: set after an image is read or a barcode is looked up,
  // so the user can check/fix the ingredients text before we analyze it.
  const [review, setReview] = useState(null); // { productName, ingredientsText, notes, readable }
  const [reviewText, setReviewText] = useState('');
  const [reviewProductName, setReviewProductName] = useState('');

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

  const startReview = ({ productName, ingredientsText, notes, readable, source, lookupKey }) => {
    setReview({ notes: notes || '', readable: readable !== false, source, lookupKey });
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
        const analysis = await analyzeText(reviewText.trim(), reviewProductName.trim());
        result = analysis.report;

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
      <div className="max-w-2xl mx-auto px-4">
        <LoadingScreen message={loadingMessage} />
      </div>
    );
  }

  // Review screen — shown after a photo is read or a barcode is found,
  // so the user can fix anything the scan missed before we analyze it.
  if (review) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={cancelReview}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
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
          className="w-full mt-4 py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-base rounded-xl transition-colors shadow-md shadow-green-200"
        >
          ✅ Looks good — Analyze
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5 mb-4">
          <span className="text-green-600 text-sm font-medium">🇮🇳 Built for India · FSSAI + EU Standards</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2 leading-tight">
          Is your food <span className="text-green-600">actually safe?</span>
        </h1>
        <p className="text-slate-500 text-base max-w-md mx-auto">
          Upload a food label or paste ingredients — get an instant health score with plain-English explanation.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
        <button
          onClick={() => { setMode('text'); setError(''); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            mode === 'text'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📝 Paste
        </button>
        <button
          onClick={() => { setMode('image'); setError(''); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            mode === 'image'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📷 Photo
        </button>
        <button
          onClick={() => { setMode('barcode'); setError(''); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            mode === 'barcode'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🔢 Barcode
        </button>
      </div>

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

      {/* Analyze Button */}
      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-base rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-200"
      >
        {mode === 'barcode' ? '🔍 Look Up Product' : '🔍 Analyze Ingredients'}
      </button>

      {/* How it works */}
      <div className="mt-10">
        <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">How it works</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: '📷', title: 'Upload or paste', desc: 'Photo, barcode, or ingredient text from the pack' },
            { icon: '🤖', title: 'AI Analysis', desc: 'Checked against FSSAI + EU/EFSA rules' },
            { icon: '📊', title: 'Get your score', desc: '0–100 score with plain-English report' },
          ].map((step, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <div className="text-2xl mb-1">{step.icon}</div>
              <div className="font-semibold text-xs text-slate-800 mb-0.5">{step.title}</div>
              <div className="text-xs text-slate-400 leading-tight">{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Gap we fill */}
      <div className="mt-6 bg-slate-800 rounded-xl p-4 text-white text-sm">
        <p className="font-semibold mb-1">🇮🇳 Why SafeBite?</p>
        <p className="text-slate-300 text-xs leading-relaxed">
          Apps like Yuka don't recognize Indian brands or FSSAI regulations. SafeBite is built from the ground up for India — understanding Indian packaged food the way international apps never could.
        </p>
      </div>
    </div>
  );
}
