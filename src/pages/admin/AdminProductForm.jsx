// src/pages/admin/AdminProductForm.jsx
//
// Add and edit share this one form. "Analyze" runs the exact same
// pipeline a real text scan uses (analyzeText.js -> the same ingredient
// database and scoring rules every other product goes through), so a
// manually-added product is scored the same way as one a real user
// scanned -- never a separately-invented "admin score". The generated
// score/verdict/summary/recommendation are then directly editable
// below, for the real correction cases this session kept running into
// (a wrong AI verdict, a name that needs fixing).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { analyzeText } from '../../services/analyzeText';
import { extractIngredientsFromImage } from '../../services/geminiService';
import { barcodeKey, textKey } from '../../services/productCache';
import { adminGetProduct, adminCreateProduct, adminUpdateProduct } from '../../services/adminProductsRepo';
import { imageFileFromClipboard, compressImageToDataUrl } from '../../utils/adminImage';

const VERDICTS = ['Excellent', 'Good', 'Moderately Healthy', 'Poor', 'Very Poor'];

function NutrientField({ label, value, onChange, unit }) {
  return (
    <div>
      <label className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-[10px] text-[14px] outline-none"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        />
        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--label-3)' }}>{unit}</span>
      </div>
    </div>
  );
}

export default function AdminProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const pasteAreaRef = useRef(null);

  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [photoFile, setPhotoFile] = useState(null); // raw File, for the extract-from-photo call
  const [photoDataUrl, setPhotoDataUrl] = useState(''); // compressed, what actually gets saved

  const [sodiumMg, setSodiumMg] = useState('');
  const [addedSugarG, setAddedSugarG] = useState('');
  const [saturatedFatG, setSaturatedFatG] = useState('');
  const [transFatG, setTransFatG] = useState('');
  const [servingGrams, setServingGrams] = useState('');

  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    adminGetProduct(id)
      .then((row) => {
        if (!row) { setError('Product not found.'); return; }
        const r = row.report || {};
        setProductName(row.product_name || r.productName || '');
        setBrand(r.brand || '');
        setBarcode(row.lookup_key?.startsWith('barcode:') ? row.lookup_key.slice('barcode:'.length) : '');
        setIngredientsText(row.ingredients_text || '');
        if (r.imageUrl) setPhotoDataUrl(r.imageUrl);
        if (r.realNutrients) {
          setSodiumMg(r.realNutrients.sodiumMg ?? '');
          setAddedSugarG(r.realNutrients.addedSugarG ?? '');
          setSaturatedFatG(r.realNutrients.saturatedFatG ?? '');
          setTransFatG(r.realNutrients.transFatG ?? '');
        }
        if (r.realNutrientsServingGrams) setServingGrams(r.realNutrientsServingGrams);
        setReport(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingExisting(false));
  }, [id, isEdit]);

  const applyPhoto = async (file) => {
    if (!file) return;
    setPhotoFile(file);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoDataUrl(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePaste = (e) => {
    const file = imageFileFromClipboard(e);
    if (file) {
      e.preventDefault();
      applyPhoto(file);
    }
  };

  const handleExtractFromPhoto = async () => {
    if (!photoFile) { setError('Paste or choose a photo first.'); return; }
    setError('');
    setExtracting(true);
    try {
      const extracted = await extractIngredientsFromImage(photoFile);
      if (!extracted.readable && !extracted.ingredientsText) {
        setError(extracted.notes || "Couldn't read that photo clearly. Try a clearer one, or type the ingredients in.");
        return;
      }
      setIngredientsText(extracted.ingredientsText);
      if (extracted.productName && extracted.productName !== 'Unknown Product' && !productName.trim()) {
        setProductName(extracted.productName);
      }
      if (extracted.notes) setError(`Extracted, but: ${extracted.notes}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const buildNutrientsInfo = () => {
    const nutrients = {};
    if (sodiumMg !== '') nutrients.sodiumMg = Number(sodiumMg);
    if (addedSugarG !== '') nutrients.addedSugarG = Number(addedSugarG);
    if (saturatedFatG !== '') nutrients.saturatedFatG = Number(saturatedFatG);
    if (transFatG !== '') nutrients.transFatG = Number(transFatG);
    if (Object.keys(nutrients).length === 0) return undefined;
    return { nutrients, servingGrams: servingGrams !== '' ? Number(servingGrams) : undefined };
  };

  const handleAnalyze = async () => {
    setError('');
    if (!productName.trim()) { setError('Product name is required.'); return; }
    if (!ingredientsText.trim()) { setError('Ingredients text is required.'); return; }

    setAnalyzing(true);
    try {
      const result = await analyzeText(
        ingredientsText.trim(),
        productName.trim(),
        brand.trim() || undefined,
        null,
        photoDataUrl || undefined,
        buildNutrientsInfo()
      );
      setReport(result.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!report) { setError('Run "Analyze" first — there’s nothing generated to save yet.'); return; }
    if (!productName.trim()) { setError('Product name is required.'); return; }

    setError('');
    setSaving(true);
    try {
      const finalReport = { ...report, productName: productName.trim(), brand: brand.trim() || null, imageUrl: photoDataUrl || null };
      const lookupKey = barcode.trim() ? barcodeKey(barcode.trim()) : textKey(ingredientsText.trim());
      const source = barcode.trim() ? 'barcode' : 'text';
      const payload = { lookupKey, source, productName: finalReport.productName, ingredientsText: ingredientsText.trim(), report: finalReport };

      if (isEdit) {
        await adminUpdateProduct(id, payload);
      } else {
        await adminCreateProduct(payload);
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return <div className="page-in max-w-2xl mx-auto px-4 py-6"><p style={{ color: 'var(--label-3)' }}>Loading…</p></div>;
  }

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <p className="text-[22px] font-bold tracking-tight mb-4" style={{ color: 'var(--label-1)' }}>
        {isEdit ? 'Edit product' : 'Add new product'}
      </p>

      <div className="rounded-[16px] p-4 mb-4 item-in" style={{ background: 'var(--bg-card)' }}>
        <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--label-2)' }}>Product details</p>

        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Product name *</label>
        <input
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] mb-3 outline-none"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Brand</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
              style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Barcode (optional)</label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Leave blank if unknown"
              className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
              style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
            />
          </div>
        </div>

        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Ingredients text *</label>
        <textarea
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          rows={4}
          placeholder="Sugar, Refined Wheat Flour (Maida), Palm Oil, ..."
          className="w-full px-3.5 py-2.5 rounded-[12px] text-[14px] outline-none resize-none"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        />
      </div>

      <div className="rounded-[16px] p-4 mb-4 item-in" style={{ background: 'var(--bg-card)' }}>
        <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--label-2)' }}>Product photo</p>

        <div
          ref={pasteAreaRef}
          tabIndex={0}
          onPaste={handlePaste}
          className="rounded-[12px] p-4 flex items-center gap-3 outline-none"
          style={{ background: 'var(--fill)', border: '1px dashed var(--separator)' }}
        >
          {photoDataUrl ? (
            <img src={photoDataUrl} alt="Product" className="w-16 h-16 rounded-[10px] object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-[10px] flex items-center justify-center text-[24px] flex-shrink-0" style={{ background: 'var(--bg-card)' }}>
              📷
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px]" style={{ color: 'var(--label-2)' }}>
              Click here and paste (Ctrl+V) a copied photo, or choose a file.
            </p>
            <div className="flex gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="tap-scale text-[12.5px] font-semibold"
                style={{ color: 'var(--tint)' }}
              >
                Choose file
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => { setPhotoDataUrl(''); setPhotoFile(null); }}
                  className="tap-scale text-[12.5px] font-semibold"
                  style={{ color: 'var(--v-poor)' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => applyPhoto(e.target.files?.[0])}
          className="hidden"
        />

        <button
          type="button"
          onClick={handleExtractFromPhoto}
          disabled={!photoFile || extracting}
          className="tap-scale w-full mt-3 py-2.5 rounded-[12px] text-[13.5px] font-semibold"
          style={{ background: 'var(--tint-bg)', color: 'var(--tint)', opacity: !photoFile || extracting ? 0.5 : 1 }}
        >
          {extracting ? 'Reading label…' : '📷 Extract ingredients from this photo'}
        </button>
      </div>

      <div className="rounded-[16px] p-4 mb-4 item-in" style={{ background: 'var(--bg-card)' }}>
        <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--label-2)' }}>Nutrition (optional)</p>
        <p className="text-[11.5px] mb-3" style={{ color: 'var(--label-3)' }}>Per 100g/100ml, if you have it — improves accuracy but isn't required.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <NutrientField label="Sodium" unit="mg" value={sodiumMg} onChange={setSodiumMg} />
          <NutrientField label="Added sugar" unit="g" value={addedSugarG} onChange={setAddedSugarG} />
          <NutrientField label="Saturated fat" unit="g" value={saturatedFatG} onChange={setSaturatedFatG} />
          <NutrientField label="Trans fat" unit="g" value={transFatG} onChange={setTransFatG} />
        </div>
        <NutrientField label="Real serving size" unit="g" value={servingGrams} onChange={setServingGrams} />
      </div>

      {error && (
        <p className="text-[13px] mb-4 p-3 rounded-[12px]" style={{ background: 'var(--fill)', color: 'var(--v-poor)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={analyzing}
        className="tap-scale w-full py-3 rounded-[12px] text-[15px] font-semibold text-white mb-4"
        style={{ background: 'var(--tint)', opacity: analyzing ? 0.6 : 1 }}
      >
        {analyzing ? 'Analyzing…' : report ? 'Re-analyze' : 'Analyze'}
      </button>

      {report && (
        <div className="rounded-[16px] p-4 mb-4 item-in" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--label-2)' }}>
            Generated result — edit anything below before saving
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Score (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={report.overallScore}
                onChange={(e) => setReport({ ...report, overallScore: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
                style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Verdict</label>
              <select
                value={report.verdict}
                onChange={(e) => setReport({ ...report, verdict: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
                style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
              >
                {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Summary</label>
          <textarea
            value={report.summary || ''}
            onChange={(e) => setReport({ ...report, summary: e.target.value })}
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-[12px] text-[13.5px] mb-3 outline-none resize-none"
            style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
          />

          <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Recommendation</label>
          <textarea
            value={report.recommendation || ''}
            onChange={(e) => setReport({ ...report, recommendation: e.target.value })}
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-[12px] text-[13.5px] mb-1 outline-none resize-none"
            style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
          />
          <p className="text-[11px]" style={{ color: 'var(--label-3)' }}>
            {report.ingredients?.length || 0} ingredients recognized · {report.flags?.length || 0} flags. Per-ingredient editing isn't in this version yet — re-run Analyze after changing the ingredients text above if something looks wrong.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!report || saving}
        className="tap-scale w-full py-3 rounded-[12px] text-[15px] font-semibold text-white"
        style={{ background: 'var(--v-very-healthy)', opacity: !report || saving ? 0.5 : 1 }}
      >
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save product'}
      </button>
    </div>
  );
}
